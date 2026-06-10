import Foundation
import Observation
import SwiftData

/// Local-first repository for weight entries. Reads come from SwiftData
/// (sorted by entry date, newest first); `refresh()` upserts the server list
/// by id and drops rows deleted elsewhere. Writes are SwiftData-first with
/// the upload queued via the sync manager. Server-computed weight stats stay
/// on the direct API in the views (hidden in Local mode).
@MainActor
@Observable
final class WeightRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let syncManager: SyncManager

    init(context: ModelContext, api: BissbilanzAPI, appMode: AppModeManager, syncManager: SyncManager) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
    }

    // MARK: - Reads (local)

    func entries() -> [WeightEntry] {
        let descriptor = FetchDescriptor<LocalWeightEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toWeightEntry() }
    }

    func latest() -> WeightEntry? {
        var descriptor = FetchDescriptor<LocalWeightEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toWeightEntry()
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getWeightEntries()
        let serverIds = Set(fetched.map(\.id))
        for stale in entries() where !serverIds.contains(stale.id) && !LocalStore.isTempId(stale.id) {
            deleteRow(id: stale.id)
        }
        for entry in fetched {
            upsert(entry)
        }
        save()
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createEntry(_ create: WeightCreate) async throws -> WeightEntry {
        let temp = makeEntry(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createWeight(body: create, localId: temp.id))
        return temp
    }

    @discardableResult
    func updateEntry(id: String, _ update: WeightUpdate) async throws -> WeightEntry {
        var optimistic: WeightEntry?
        if let row = fetchRow(id: id), let existing = row.toWeightEntry() {
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let updated = (try? JSONPatch.merged(WeightEntry.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateWeight(id: id, body: update))
        }
        if let optimistic {
            return optimistic
        }
        throw APIError.notFound
    }

    func deleteEntry(id: String) async throws {
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "weight", affectedId: id)
        } else {
            syncManager.enqueue(.deleteWeight(id: id))
        }
    }

    /// Rewrites the still-queued create for a temp-id weight entry so the
    /// eventual upload carries the edited values.
    private func coalesceQueuedCreate(tempId: String, update: WeightUpdate) {
        for row in syncManager.queuedOperations(table: "weight", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createWeight(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(WeightCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createWeight(body: merged, localId: localId))
        }
    }

    // MARK: - Conversion helpers

    private func makeEntry(from create: WeightCreate, id: String) -> WeightEntry {
        let now = ISO8601DateFormatter().string(from: Date())
        return WeightEntry(
            id: id,
            userId: "",
            weightKg: create.weightKg,
            entryDate: create.entryDate,
            loggedAt: now,
            notes: create.notes,
            createdAt: now,
            updatedAt: nil
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalWeightEntry? {
        var descriptor = FetchDescriptor<LocalWeightEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ entry: WeightEntry) {
        if let row = fetchRow(id: entry.id) {
            row.update(from: entry)
        } else {
            context.insert(LocalWeightEntry(entry: entry))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func save() {
        try? context.save()
    }
}
