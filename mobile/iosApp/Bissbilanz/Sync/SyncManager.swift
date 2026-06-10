import Foundation
import Observation
import SwiftData

/// Persistent offline write queue + drainer, mirroring the Android
/// `SyncQueue`/`SyncManager` pair on the main actor.
///
/// Repositories enqueue writes in Synced mode (in Local mode `enqueue` is a
/// no-op — the local store is the primary store and the login migrator uploads
/// it wholesale). The queue drains FIFO whenever something is enqueued,
/// connectivity is regained, or the app foregrounds. Per-operation outcomes:
/// - success → row removed; for creates the local `temp_` row is replaced with
///   the server record (shared `LocalRemap` helpers, same code the migrator uses).
/// - 4xx (except 401) → the server rejected the payload; the row is dropped and
///   an error is recorded.
/// - 401 → `performRequest` already refreshed and retried once, so a final 401
///   means the session is dead: draining stops, the queue is kept.
/// - 5xx / network errors → retryCount increments and draining stops; after
///   `maxRetries` failed attempts the row is dropped with an error.
@MainActor
@Observable
final class SyncManager {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let connectivity: ConnectivityMonitor

    private(set) var isSyncing = false
    private(set) var pendingCount = 0
    private(set) var errors: [String] = []
    private(set) var lastSyncedAt: Date?

    @ObservationIgnored private var isDraining = false

    /// Test seam: when false, `scheduleDrain` becomes a no-op so tests
    /// control drain timing explicitly via `drainPendingQueue`.
    @ObservationIgnored var autoDrain = true

    static let maxRetries = 3

    init(
        context: ModelContext,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        connectivity: ConnectivityMonitor
    ) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.connectivity = connectivity
        pendingCount = queuedRows().count
        connectivity.onOnlineChange = { [weak self] online in
            if online {
                self?.scheduleDrain()
            }
        }
    }

    // MARK: - Queue

    /// Persists an operation for upload. In Local mode the local store is the
    /// primary store, so nothing is queued — the login migrator uploads the
    /// store state when switching to Synced; queued ops would double-apply.
    func enqueue(_ operation: SyncOperation) {
        guard !appMode.isLocal else { return }
        context.insert(PendingSyncOperation(seq: nextSeq(), operation: operation))
        save()
        pendingCount = queuedRows().count
        scheduleDrain()
    }

    /// Queued rows touching (table, id) in FIFO order — the coalescing lookup.
    func queuedOperations(table: String, affectedId: String) -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.affectedTable == table && $0.affectedId == affectedId },
            sortBy: [SortDescriptor(\.seq)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Rewrites a queued operation in place (temp-id coalescing).
    func replace(_ row: PendingSyncOperation, with operation: SyncOperation) {
        row.replaceOperation(operation)
        save()
    }

    func remove(_ row: PendingSyncOperation) {
        context.delete(row)
        save()
        pendingCount = queuedRows().count
    }

    /// Drops every queued operation touching (table, id) — used when a
    /// `temp_` row is deleted before its create drained (this also removes
    /// queued supplement-logs for a temp supplement, which share the table/id).
    func removeQueued(table: String, affectedId: String) {
        for row in queuedOperations(table: table, affectedId: affectedId) {
            context.delete(row)
        }
        save()
        pendingCount = queuedRows().count
    }

    func clearQueue() {
        try? context.delete(model: PendingSyncOperation.self)
        save()
        pendingCount = 0
    }

    // MARK: - Draining

    /// Fire-and-forget drain trigger (enqueue, connectivity regained, app
    /// foreground). The drain itself is reentrancy-guarded.
    func scheduleDrain() {
        guard autoDrain else { return }
        Task {
            await drainPendingQueue()
        }
    }

    /// Uploads queued operations FIFO. Returns the number of operations
    /// removed from the queue (successes and permanent drops).
    @discardableResult
    func drainPendingQueue() async -> Int {
        guard !appMode.isLocal, !isDraining, connectivity.isOnline else { return 0 }
        isDraining = true
        isSyncing = true
        errors = []
        var processed = 0
        defer {
            isSyncing = false
            isDraining = false
            pendingCount = queuedRows().count
            if processed > 0 {
                lastSyncedAt = Date()
            }
        }

        for row in queuedRows() {
            // Coalescing may have removed the row while an earlier op was in flight.
            guard !row.isDeleted else { continue }
            guard let operation = row.operation() else {
                // Unreadable payload — nothing useful can ever be uploaded.
                remove(row)
                continue
            }
            do {
                try await execute(operation)
                if !row.isDeleted {
                    remove(row)
                }
                processed += 1
            } catch {
                switch Self.classify(error) {
                case .unauthorized:
                    errors.append("Session expired. Please log in again to sync pending changes.")
                    return processed

                case let .clientError(status):
                    remove(row)
                    processed += 1
                    errors.append("Failed to sync \(operation.summary): HTTP \(status)")

                case .retryable:
                    row.retryCount += 1
                    if row.retryCount >= Self.maxRetries {
                        remove(row)
                        processed += 1
                        errors.append("Gave up syncing \(operation.summary) after \(Self.maxRetries) retries.")
                    } else {
                        save()
                        return processed
                    }
                }
            }
            pendingCount = queuedRows().count
        }
        return processed
    }

    // MARK: - Execution

    private func execute(_ operation: SyncOperation) async throws {
        switch operation {
        case let .createFood(body, localId):
            let server = try await api.createFood(body)
            LocalRemap.replaceFood(id: localId, with: server, in: context)

        case let .updateFood(id, body):
            _ = try await api.updateFood(id: id, body)

        case let .deleteFood(id):
            try await api.deleteFood(id: id)

        case let .toggleFavorite(id, isFavorite):
            _ = try await api.toggleFavorite(foodId: id, isFavorite: isFavorite)

        case let .createEntry(body, localId):
            let server = try await api.createEntry(body)
            // POST responses are raw DB rows without resolved macros — merge
            // the display fields from the optimistic local row.
            let local = LocalRemap.entryRow(id: localId, in: context)?.toEntry()
            let merged = local.map { EntryRepository.merge(server: server, local: $0) } ?? server
            LocalRemap.replaceEntry(id: localId, with: merged, date: merged.date ?? body.date, in: context)

        case let .updateEntry(id, body):
            _ = try await api.updateEntry(id: id, body)

        case let .deleteEntry(id):
            try await api.deleteEntry(id: id)

        case let .createRecipe(body, localId):
            let server = try await api.createRecipe(body)
            LocalRemap.replaceRecipe(id: localId, with: server, in: context)

        case let .updateRecipe(id, body):
            _ = try await api.updateRecipe(id: id, body)

        case let .deleteRecipe(id):
            try await api.deleteRecipe(id: id)

        case let .setGoals(body):
            _ = try await api.setGoals(body)

        case let .createWeight(body, localId):
            let server = try await api.createWeightEntry(body)
            LocalRemap.replaceWeight(id: localId, with: server, in: context)

        case let .updateWeight(id, body):
            _ = try await api.updateWeightEntry(id: id, body)

        case let .deleteWeight(id):
            try await api.deleteWeightEntry(id: id)

        case let .createSupplement(body, localId):
            let server = try await api.createSupplement(body)
            LocalRemap.replaceSupplement(id: localId, with: server, rekeyLogIds: false, in: context)

        case let .updateSupplement(id, body):
            _ = try await api.updateSupplement(id: id, body)

        case let .deleteSupplement(id):
            try await api.deleteSupplement(id: id)

        case let .logSupplement(supplementId, date):
            _ = try await api.logSupplement(id: supplementId, date: date)

        case let .unlogSupplement(supplementId, date):
            try await api.unlogSupplement(id: supplementId, date: date)

        case let .setDayProperties(date, isFastingDay):
            _ = try await api.setDayProperties(date: date, isFastingDay: isFastingDay)

        case let .deleteDayProperties(date):
            try await api.deleteDayProperties(date: date)

        case let .updatePreferences(body):
            _ = try await api.updatePreferences(body)
        }
    }

    // MARK: - Error classification

    private enum FailureKind {
        case unauthorized
        case clientError(Int)
        case retryable
    }

    private static func classify(_ error: Error) -> FailureKind {
        guard let apiError = error as? APIError else { return .retryable }
        switch apiError {
        case .unauthorized:
            return .unauthorized
        case .badRequest:
            return .clientError(400)
        case .notFound:
            return .clientError(404)
        case let .serverError(status, _):
            return status < 500 ? .clientError(status) : .retryable
        case .networkError, .decodingError:
            return .retryable
        }
    }

    // MARK: - Store helpers

    /// All queued rows in FIFO order.
    func queuedRows() -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.seq)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func nextSeq() -> Int {
        var descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.seq, order: .reverse)])
        descriptor.fetchLimit = 1
        let highest = (try? context.fetch(descriptor))?.first?.seq ?? 0
        return highest + 1
    }

    private func save() {
        try? context.save()
    }
}
