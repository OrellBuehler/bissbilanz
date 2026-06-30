import Foundation
import Observation
import SwiftData

/// Local-first repository for sleep entries. Reads come from SwiftData
/// (sorted by entry date, newest first); `refresh()` upserts the server list
/// by id and drops rows deleted elsewhere. Writes are SwiftData-first with
/// the upload queued via the sync manager.
@MainActor
@Observable
final class SleepRepository {
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

    func entries() -> [SleepEntry] {
        let descriptor = FetchDescriptor<LocalSleepEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toSleepEntry() }
    }

    /// One page of entries, newest first — backs the paginated history list.
    func entries(offset: Int, limit: Int) -> [SleepEntry] {
        var descriptor = FetchDescriptor<LocalSleepEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        descriptor.fetchOffset = offset
        descriptor.fetchLimit = limit
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toSleepEntry() }
    }

    func latest() -> SleepEntry? {
        var descriptor = FetchDescriptor<LocalSleepEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toSleepEntry()
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getSleepEntries()
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
    func createEntry(_ create: SleepCreate) async throws -> SleepEntry {
        let temp = makeEntry(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createSleep(body: create, localId: temp.id))
        return temp
    }

    @discardableResult
    func updateEntry(id: String, _ update: SleepUpdate) async throws -> SleepEntry {
        var optimistic: SleepEntry?
        if let row = fetchRow(id: id), let existing = row.toSleepEntry() {
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let updated = (try? JSONPatch.merged(SleepEntry.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateSleep(id: id, body: update))
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
            syncManager.removeQueued(table: "sleep", affectedId: id)
        } else {
            syncManager.enqueue(.deleteSleep(id: id))
        }
    }

    /// Rewrites the still-queued create for a temp-id sleep entry so the
    /// eventual upload carries the edited values.
    private func coalesceQueuedCreate(tempId: String, update: SleepUpdate) {
        for row in syncManager.queuedOperations(table: "sleep", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createSleep(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(SleepCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createSleep(body: merged, localId: localId))
        }
    }

    // MARK: - Conversion helpers

    private func makeEntry(from create: SleepCreate, id: String) -> SleepEntry {
        let now = ISO8601DateFormatter().string(from: Date())
        return SleepEntry(
            id: id,
            userId: "",
            entryDate: create.entryDate,
            durationMinutes: create.durationMinutes,
            quality: create.quality,
            bedtime: create.bedtime,
            wakeTime: create.wakeTime,
            wakeUps: create.wakeUps,
            sleepLatencyMinutes: nil,
            deepSleepMinutes: nil,
            lightSleepMinutes: nil,
            remSleepMinutes: nil,
            source: nil,
            notes: create.notes,
            loggedAt: now,
            createdAt: now,
            updatedAt: nil
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalSleepEntry? {
        var descriptor = FetchDescriptor<LocalSleepEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ entry: SleepEntry) {
        if let row = fetchRow(id: entry.id) {
            row.update(from: entry)
        } else {
            context.insert(LocalSleepEntry(entry: entry))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func save() {
        try? context.save()
        WidgetSnapshotWriter.scheduleUpdate(context: context)
    }
}
