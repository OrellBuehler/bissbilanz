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

    /// One page of entries, newest first — backs the paginated history list.
    func entries(offset: Int, limit: Int) -> [WeightEntry] {
        var descriptor = FetchDescriptor<LocalWeightEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        descriptor.fetchOffset = offset
        descriptor.fetchLimit = limit
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

    /// The entry whose day is nearest to `date` ("yyyy-MM-dd") in either
    /// direction, preferring the on-or-before side on a tie.
    func closest(to date: String) -> WeightEntry? {
        var beforeDescriptor = FetchDescriptor<LocalWeightEntry>(
            predicate: #Predicate { $0.entryDate <= date },
            sortBy: [SortDescriptor(\.entryDate, order: .reverse)]
        )
        beforeDescriptor.fetchLimit = 1
        var afterDescriptor = FetchDescriptor<LocalWeightEntry>(
            predicate: #Predicate { $0.entryDate > date },
            sortBy: [SortDescriptor(\.entryDate, order: .forward)]
        )
        afterDescriptor.fetchLimit = 1
        let before = (try? context.fetch(beforeDescriptor))?.first?.toWeightEntry()
        let after = (try? context.fetch(afterDescriptor))?.first?.toWeightEntry()
        guard let before else { return after }
        guard let after else { return before }
        return DateFormatting.dayDistance(before.entryDate, date)
            <= DateFormatting.dayDistance(after.entryDate, date) ? before : after
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getWeightEntries()
        let serverIds = Set(fetched.map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response: a refresh racing the sync-queue upload would otherwise
        // reapply the stale server copy over the user's edit (see
        // EntryRepository.refresh, PR #416).
        let pendingIds = syncManager.pendingAffectedIds(table: "weight")
        for stale in entries() where !serverIds.contains(stale.id)
            && !LocalStore.isTempId(stale.id) && !pendingIds.contains(stale.id)
        {
            deleteRow(id: stale.id)
        }
        for entry in fetched where !pendingIds.contains(entry.id) {
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

    /// A missing local row means the record is gone (deleted elsewhere, or
    /// never cached) — the failure is reported without also queueing an upload
    /// for it. Enqueuing first and throwing afterwards told the caller the edit
    /// had failed while it was already on its way to the server, so the next
    /// refresh brought back the change the UI had just reported as failed.
    @discardableResult
    func updateEntry(id: String, _ update: WeightUpdate) async throws -> WeightEntry {
        guard let row = fetchRow(id: id), let existing = row.toWeightEntry() else {
            throw APIError.notFound
        }
        let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        let updated = (try? JSONPatch.merged(WeightEntry.self, base: existing, patch: patch)) ?? existing
        row.update(from: updated)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateWeight(id: id, body: update))
        }
        return updated
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
        WidgetSnapshotWriter.scheduleUpdate(context: context)
        syncLatestToHealth()
    }

    // MARK: - Apple Health write-back

    /// Dates `HealthKitImporter` is currently writing entries for, read *from*
    /// Health, with the number of import scopes currently covering each. Scoped
    /// to dates rather than a global flag so a refresh landing a weight for some
    /// other day mid-import still writes back normally.
    @ObservationIgnored private var healthImportDateCounts: [String: Int] = [:]

    /// Runs `body` with the Health write-back suppressed for `dates`. Those
    /// entries came out of Health, so they get marked as already synced instead
    /// of being written back as app-authored duplicates of the scale's samples.
    ///
    /// Reference-counted, because overlapping imports are the normal case:
    /// `BissbilanzApp` runs `importAllIfEnabled` on every foreground
    /// activation while the Weight tab independently imports from its own `.task`
    /// and pull-to-refresh. With a plain set cleared in `defer`, the inner
    /// scope's exit re-enabled write-back while the outer one was still
    /// writing — producing exactly the app-authored duplicates of the
    /// device's own samples that this suppression exists to prevent.
    func withHealthImportInProgress<T>(dates: Set<String>, _ body: @MainActor () async throws -> T) async rethrows -> T {
        for date in dates {
            healthImportDateCounts[date, default: 0] += 1
        }
        defer {
            for date in dates {
                guard let count = healthImportDateCounts[date] else { continue }
                if count <= 1 {
                    healthImportDateCounts.removeValue(forKey: date)
                } else {
                    healthImportDateCounts[date] = count - 1
                }
            }
        }
        return try await body()
    }

    /// Pushes the newest weight to Apple Health on every store mutation — writes,
    /// refreshes and deletes alike. This used to live in the weight edit sheet,
    /// which meant a weight logged on the Apple Watch, or arriving from web, MCP
    /// or Android through `refresh()`, never reached Health at all. Android hangs
    /// the same export off its repository callbacks.
    ///
    /// Fire-and-forget, like the widget update above it. The marker guard inside
    /// `syncLatestWeight` makes an unchanged repeat free.
    private func syncLatestToHealth() {
        guard let latest = latest() else { return }
        let alreadyInHealth = healthImportDateCounts[latest.entryDate] != nil
        Task {
            await HealthKitService.shared.syncLatestWeight(
                latest.weightKg,
                entryDate: latest.entryDate,
                alreadyInHealth: alreadyInHealth
            )
        }
    }
}
