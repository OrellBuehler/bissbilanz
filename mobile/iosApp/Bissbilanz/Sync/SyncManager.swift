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
/// - HTTP 409 + `X-Sync-Conflict: server-newer` → LWW lost; row removed, a
///   conflict notice is surfaced via `conflictNotices`, refresh triggered.
/// - HTTP 409 without header → real validation conflict; dead-letter (drop + error).
/// - HTTP 404/410 on DELETE → idempotent; treat as success, remove silently.
/// - HTTP 404/410 on other ops → record deleted elsewhere; remove + conflict notice.
/// - 401 → `performRequest` already refreshed and retried once, so a final 401
///   means the session is dead: draining stops, the queue is kept.
/// - 5xx / network errors → retryCount increments, exponential backoff via
///   `nextAttemptAt`; after `maxRetries` failed attempts the row is dropped with
///   an error.
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
    private(set) var conflictNotices: [String] = []
    private(set) var lastSyncedAt: Date?

    @ObservationIgnored private var isDraining = false
    /// A pending delayed re-drain scheduled for when the soonest backoff expires.
    @ObservationIgnored private var retryTask: Task<Void, Never>?

    /// Invoked once per drain that resolved at least one conflict, so the app can
    /// pull the affected entities back down. Without it the row that *lost* keeps
    /// showing its superseded value until some unrelated refresh overwrites it.
    /// Set by the app once its repositories exist.
    @ObservationIgnored var onConflictResolved: (() async -> Void)?

    /// Test seam: when false, `scheduleDrain` becomes a no-op so tests
    /// control drain timing explicitly via `drainPendingQueue`.
    @ObservationIgnored var autoDrain = true

    static let maxRetries = 5
    private static let backoffBase: TimeInterval = 2.0
    private static let backoffCap: TimeInterval = 5 * 60.0
    private static let backoffJitter: TimeInterval = 0.5

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

    /// Affected ids that still have an un-uploaded queued write for `table`. A
    /// refresh uses this to avoid overwriting optimistic local rows with stale
    /// server state while their edit is still waiting in the queue.
    func pendingAffectedIds(table: String) -> Set<String> {
        Set(queuedRows().filter { $0.affectedTable == table }.compactMap(\.affectedId))
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
    /// The idempotencyKey is NOT changed — coalescing never changes the logical operation.
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

    /// Drops the conflict notices once the user has acknowledged them.
    func clearConflictNotices() {
        conflictNotices = []
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
        var sawConflict = false
        ErrorReporter.addBreadcrumb("drain start", category: "sync", data: ["sync.pending": pendingCount])
        defer {
            isSyncing = false
            isDraining = false
            pendingCount = queuedRows().count
            if processed > 0 {
                lastSyncedAt = Date()
            }
            // Recover backed-off ops without waiting for an external trigger.
            scheduleRetryDrain()
        }

        // Re-fetch the head each iteration instead of iterating a start-of-
        // drain snapshot: operations enqueued while an upload is in flight
        // (their `scheduleDrain` is swallowed by the `isDraining` guard) are
        // picked up by this drain instead of waiting for the next trigger.
        // Every iteration removes the head row, backs it off, or returns, so the
        // loop terminates. Items whose `nextAttemptAt` is in the future are
        // skipped via `nextDueRow()` (backoff) — a backed-off op no longer
        // stalls the ops queued behind it. That skip only applies to failures
        // scoped to one operation; a server-scoped failure ends the drain, so an
        // outage cannot charge a retry to every queued op at once.
        drain: while let row = nextDueRow() {
            guard let operation = row.operation() else {
                // Unreadable payload — nothing useful can ever be uploaded.
                // Capture before dropping: this is the most invisible data-loss
                // path in the drain (a corrupted or schema-changed payload, else
                // discarded with no error, notice, or telemetry).
                ErrorReporter.captureWarning(
                    "Sync op dropped: undecodable payload",
                    context: ["sync.type": row.type, "sync.seq": row.seq, "sync.outcome": "dropped_undecodable"]
                )
                remove(row)
                continue
            }
            let isDelete = isDeleteOperation(operation)
            ErrorReporter.addBreadcrumb(
                "drain \(operation.typeName)",
                category: "sync",
                data: ["sync.op": operation.typeName, "sync.retry_count": row.retryCount]
            )
            do {
                try await execute(operation, idempotencyKey: row.idempotencyKey, clientEditedAt: row.clientEditedAt)
                if !row.isDeleted {
                    remove(row)
                }
                processed += 1
            } catch {
                let kind = Self.classify(error, isOnline: connectivity.isOnline)
                switch kind {
                case .unauthorized:
                    errors.append("Session expired. Please log in again to sync pending changes.")
                    break drain

                case .conflict(serverNewer: true):
                    remove(row)
                    processed += 1
                    sawConflict = true
                    conflictNotices.append(
                        "Offline change to \(operation.summary) was superseded by a newer change from another device."
                    )

                case .conflict(serverNewer: false):
                    remove(row)
                    processed += 1
                    errors.append("Failed to sync \(operation.summary): HTTP 409")
                    ErrorReporter.captureWarning(
                        "Sync op dropped: validation conflict",
                        context: dropContext(operation, row, outcome: "dropped_validation_conflict", status: 409)
                    )

                case .notFound where isDelete:
                    remove(row)
                    processed += 1

                case .notFound:
                    remove(row)
                    processed += 1
                    sawConflict = true
                    conflictNotices.append(
                        "Offline change to \(operation.summary) was lost: the record was deleted on another device."
                    )
                    ErrorReporter.captureWarning(
                        "Sync op lost: record deleted elsewhere",
                        context: dropContext(operation, row, outcome: "lost_deleted_elsewhere", status: 404)
                    )

                case let .clientError(status):
                    remove(row)
                    processed += 1
                    errors.append("Failed to sync \(operation.summary): HTTP \(status)")
                    ErrorReporter.captureWarning(
                        "Sync op dropped: client error",
                        context: dropContext(operation, row, outcome: "dropped_client_error", status: status)
                    )

                case .offline:
                    break drain

                case .retryableOperation, .serverUnavailable:
                    row.retryCount += 1
                    if row.retryCount >= Self.maxRetries {
                        remove(row)
                        processed += 1
                        errors.append("Gave up syncing \(operation.summary) after \(Self.maxRetries) retries.")
                        ErrorReporter.captureWarning(
                            "Sync op dropped: max retries",
                            context: dropContext(operation, row, outcome: "dropped_max_retries", status: nil)
                        )
                        // Keep going even when the server looked unavailable: if this op
                        // was simply poison the queue behind it is fine, and if the server
                        // really is down the next op backs off and aborts below.
                    } else {
                        row.nextAttemptAt = backoffDate(retryCount: row.retryCount, id: row.id)
                        save()
                        if case .serverUnavailable = kind {
                            // Abort. Every remaining op would hit the same outage, and
                            // because `nextDueRow` skips this backed-off row the drain
                            // would charge a retry to each of them — five drains of a
                            // one-minute outage would dead-letter the entire queue.
                            break drain
                        }
                        // Per-operation failure: skip it. A backed-off row is filtered out
                        // by `nextDueRow`, so the loop advances to the next due op instead
                        // of stalling the whole queue behind this one.
                        continue
                    }
                }
            }
            pendingCount = queuedRows().count
        }
        // Once per drain, not once per conflict: a batch that lost three edits needs
        // a single refresh. Reached on every exit path — a drain that resolved a
        // conflict and then hit an outage still owes the UI that refresh.
        if sawConflict {
            await onConflictResolved?()
        }
        return processed
    }

    /// Rewrites still-queued operation payloads (and their affected table/id
    /// columns) that reference a resolved `temp_` id, so chained offline
    /// creates upload with the server id (the queue-side counterpart of
    /// `LocalRemap`, which rewrites the local rows).
    func remapQueuedReferences(from oldId: String, to newId: String) {
        guard oldId != newId else { return }
        var changed = false
        for row in queuedRows() {
            guard let operation = row.operation(),
                  let remapped = operation.remappingReferences(from: oldId, to: newId)
            else { continue }
            row.replaceOperation(remapped)
            changed = true
        }
        if changed {
            save()
        }
    }

    // MARK: - Execution

    private func execute(_ operation: SyncOperation, idempotencyKey: String, clientEditedAt: String) async throws {
        switch operation {
        case let .createFood(body, localId):
            let server = try await api.createFood(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
            guard LocalRemap.foodRow(id: localId, in: context) != nil else {
                enqueue(.deleteFood(id: server.id))
                return
            }
            LocalRemap.replaceFood(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateFood(id, body):
            _ = try await api.updateFood(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .deleteFood(id):
            try await api.deleteFood(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .toggleFavorite(id, isFavorite):
            _ = try await api.toggleFavorite(
                foodId: id,
                isFavorite: isFavorite,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .createEntry(body, localId):
            let server = try await api.createEntry(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
            guard let local = LocalRemap.entryRow(id: localId, in: context)?.toEntry() else {
                enqueue(.deleteEntry(id: server.id))
                return
            }
            let merged = EntryRepository.merge(server: server, local: local)
            LocalRemap.replaceEntry(id: localId, with: merged, date: merged.date ?? body.date, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateEntry(id, body):
            _ = try await api.updateEntry(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .deleteEntry(id):
            try await api.deleteEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createRecipe(body, localId):
            let server = try await api.createRecipe(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.recipeRow(id: localId, in: context) != nil else {
                enqueue(.deleteRecipe(id: server.id))
                return
            }
            LocalRemap.replaceRecipe(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateRecipe(id, body):
            _ = try await api.updateRecipe(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .deleteRecipe(id):
            try await api.deleteRecipe(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .setGoals(body):
            _ = try await api.setGoals(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createWeight(body, localId):
            let server = try await api.createWeightEntry(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.weightRow(id: localId, in: context) != nil else {
                enqueue(.deleteWeight(id: server.id))
                return
            }
            LocalRemap.replaceWeight(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateWeight(id, body):
            _ = try await api.updateWeightEntry(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteWeight(id):
            try await api.deleteWeightEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createSleep(body, localId):
            let server = try await api.createSleepEntry(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.sleepRow(id: localId, in: context) != nil else {
                enqueue(.deleteSleep(id: server.id))
                return
            }
            LocalRemap.replaceSleep(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateSleep(id, body):
            _ = try await api.updateSleepEntry(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteSleep(id):
            try await api.deleteSleepEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createSupplement(body, localId):
            let server = try await api.createSupplement(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.supplementRow(id: localId, in: context) != nil else {
                enqueue(.deleteSupplement(id: server.id))
                return
            }
            LocalRemap.replaceSupplement(id: localId, with: server, rekeyLogIds: false, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateSupplement(id, body):
            _ = try await api.updateSupplement(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteSupplement(id):
            try await api.deleteSupplement(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .logSupplement(supplementId, date):
            _ = try await api.logSupplement(
                id: supplementId,
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .unlogSupplement(supplementId, date):
            try await api.unlogSupplement(
                id: supplementId,
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .setDayProperties(date, isFastingDay):
            _ = try await api.setDayProperties(
                date: date,
                isFastingDay: isFastingDay,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteDayProperties(date):
            try await api.deleteDayProperties(
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .updatePreferences(body):
            _ = try await api.updatePreferences(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        }
    }

    // MARK: - Error classification

    private enum FailureKind {
        case unauthorized
        case conflict(serverNewer: Bool)
        case notFound
        case clientError(Int)
        case offline
        /// The payload, not the server: this one operation is at fault and the rest
        /// of the queue is unaffected.
        case retryableOperation
        /// The server or the transport is failing, so every queued operation would
        /// fail the same way.
        case serverUnavailable
    }

    private static func classify(_ error: Error, isOnline: Bool) -> FailureKind {
        guard let apiError = error as? APIError else {
            // Unknown throws default to server-scoped: mistaking a global failure for a
            // per-operation one dead-letters the whole queue, while the reverse only
            // stalls it until `maxRetries` drops the offending op.
            return isConnectivityError(error, isOnline: isOnline) ? .offline : .serverUnavailable
        }
        switch apiError {
        case .unauthorized:
            return .unauthorized
        case let .conflict(serverNewer):
            return .conflict(serverNewer: serverNewer)
        case .notFound:
            return .notFound
        case .gone:
            return .notFound
        case .badRequest:
            return .clientError(400)
        case let .serverError(status, _):
            return status < 500 ? .clientError(status) : .serverUnavailable
        case let .networkError(underlying):
            return isConnectivityError(underlying, isOnline: isOnline) ? .offline : .serverUnavailable
        case .decodingError:
            // A response this build cannot read is a contract mismatch on one endpoint,
            // not an outage — the ops queued behind it may well upload fine.
            return .retryableOperation
        }
    }

    /// Obvious "the device has no connection" URLErrors. `.timedOut` only
    /// counts while the connectivity monitor reports offline — online
    /// timeouts may be a struggling server and should consume retries.
    private static func isConnectivityError(_ error: Error, isOnline: Bool) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost:
            return true
        case .timedOut:
            return !isOnline
        default:
            return false
        }
    }

    private func isDeleteOperation(_ operation: SyncOperation) -> Bool {
        switch operation {
        case .deleteFood, .deleteEntry, .deleteRecipe, .deleteWeight,
             .deleteSupplement, .deleteSleep, .deleteDayProperties,
             .unlogSupplement:
            true
        default:
            false
        }
    }

    // MARK: - Backoff

    private func backoffDate(retryCount: Int, id: UUID) -> Date {
        let base = Self.backoffBase * pow(2.0, Double(min(retryCount, 20)))
        let jitter = Self.backoffJitter * Double(id.hashValue & 0xFF) / 255.0
        let delay = min(base + jitter, Self.backoffCap)
        return Date().addingTimeInterval(delay)
    }

    // MARK: - Store helpers

    /// Next queued row whose backoff has expired (nextAttemptAt <= now), in FIFO order.
    private func nextDueRow() -> PendingSyncOperation? {
        let now = Date()
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.nextAttemptAt <= now },
            sortBy: [SortDescriptor(\.seq)]
        )
        var limited = descriptor
        limited.fetchLimit = 1
        return (try? context.fetch(limited))?.first
    }

    /// All queued rows in FIFO order.
    func queuedRows() -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.seq)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func nextSeq() -> Int {
        PendingSyncOperation.nextSeq(in: context)
    }

    private func save() {
        try? context.save()
    }

    /// Structured context for a permanent-drop Sentry warning so a "changes won't
    /// sync" report is unambiguous from telemetry alone (which op, how many
    /// retries, the stable idempotency key, and why it was dropped).
    private func dropContext(
        _ operation: SyncOperation,
        _ row: PendingSyncOperation,
        outcome: String,
        status: Int?
    ) -> [String: Any] {
        var context: [String: Any] = [
            "sync.op": operation.typeName,
            "sync.summary": operation.summary,
            "sync.retry_count": row.retryCount,
            "sync.idempotency_key": row.idempotencyKey,
            "sync.outcome": outcome,
        ]
        if let status {
            context["status_code"] = status
        }
        return context
    }

    /// After a drain leaves backed-off rows behind, schedule a single delayed
    /// re-drain at the soonest `nextAttemptAt`. `scheduleDrain` otherwise only
    /// fires on enqueue / connectivity-regained / foreground, none of which is
    /// guaranteed while a backoff window elapses — so a transient failure would
    /// leave `pendingCount > 0` until the user happens to trigger another drain.
    private func scheduleRetryDrain() {
        guard autoDrain else { return }
        retryTask?.cancel()
        let now = Date()
        guard let soonest = queuedRows().map(\.nextAttemptAt).filter({ $0 > now }).min() else {
            retryTask = nil
            return
        }
        let delay = max(soonest.timeIntervalSinceNow, 0)
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.scheduleDrain()
        }
    }

    /// User-initiated retry from the pending-changes screen: clear all backoff so
    /// every queued op is due immediately, then drain.
    func retryNow() {
        for row in queuedRows() {
            row.nextAttemptAt = Date.distantPast
        }
        save()
        scheduleDrain()
    }

    /// Test seam: resets `nextAttemptAt` on all queued rows so the next drain
    /// picks them up immediately, bypassing the exponential backoff delay.
    func resetBackoffForTesting() {
        for row in queuedRows() {
            row.nextAttemptAt = Date.distantPast
        }
        save()
    }
}
