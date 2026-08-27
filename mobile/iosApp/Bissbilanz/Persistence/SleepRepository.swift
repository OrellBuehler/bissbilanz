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

    /// The entry whose day is nearest to `date` ("yyyy-MM-dd") in either
    /// direction, preferring the on-or-before side on a tie.
    func closest(to date: String) -> SleepEntry? {
        var beforeDescriptor = FetchDescriptor<LocalSleepEntry>(
            predicate: #Predicate { $0.entryDate <= date },
            sortBy: [SortDescriptor(\.entryDate, order: .reverse)]
        )
        beforeDescriptor.fetchLimit = 1
        var afterDescriptor = FetchDescriptor<LocalSleepEntry>(
            predicate: #Predicate { $0.entryDate > date },
            sortBy: [SortDescriptor(\.entryDate, order: .forward)]
        )
        afterDescriptor.fetchLimit = 1
        let before = (try? context.fetch(beforeDescriptor))?.first?.toSleepEntry()
        let after = (try? context.fetch(afterDescriptor))?.first?.toSleepEntry()
        guard let before else { return after }
        guard let after else { return before }
        return DateFormatting.dayDistance(before.entryDate, date)
            <= DateFormatting.dayDistance(after.entryDate, date) ? before : after
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getSleepEntries()
        let serverIds = Set(fetched.map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response: a refresh racing the sync-queue upload would otherwise
        // reapply the stale server copy over the user's edit (see
        // EntryRepository.refresh, PR #416).
        let pendingIds = syncManager.pendingAffectedIds(table: "sleep")
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
    func createEntry(_ create: SleepCreate) async throws -> SleepEntry {
        let temp = makeEntry(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createSleep(body: create, localId: temp.id))
        return temp
    }

    /// See `EntryRepository.updateEntry` — a missing local row is reported as a
    /// failure without also queueing an upload the caller was just told failed.
    @discardableResult
    func updateEntry(id: String, _ update: SleepUpdate) async throws -> SleepEntry {
        guard let row = fetchRow(id: id), let existing = row.toSleepEntry() else {
            throw APIError.notFound
        }
        let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        let updated = (try? JSONPatch.merged(SleepEntry.self, base: existing, patch: patch)) ?? existing
        row.update(from: updated)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateSleep(id: id, body: update))
        }
        return updated
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
        syncLatestToHealth()
    }

    // MARK: - Apple Health write-back

    /// Dates `HealthKitImporter` is currently writing nights for, read *from*
    /// Health, with the number of import scopes currently covering each. See the
    /// weight repository's twin.
    @ObservationIgnored private var healthImportDateCounts: [String: Int] = [:]

    /// Runs `body` with the Health write-back suppressed for `dates` — imported
    /// nights are marked as already synced rather than written back as
    /// duplicates of the Watch's own sleep samples.
    ///
    /// Reference-counted, because overlapping imports are the normal case:
    /// `BissbilanzApp` runs `importAllIfEnabled` on every foreground
    /// activation while the Sleep tab independently imports from its own `.task`
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

    /// Pushes the newest night to Apple Health on every store mutation. This used
    /// to live in the sleep edit sheet, so a night logged on the Apple Watch or
    /// arriving through `refresh()` never reached Health.
    ///
    /// Nights without both a bedtime and a wake time are skipped — Health needs a
    /// real interval and a fabricated one would pollute it.
    private func syncLatestToHealth() {
        guard let latest = latest(),
              let bedtimeString = latest.bedtime,
              let wakeTimeString = latest.wakeTime,
              let bedtime = DateFormatting.isoDateTime(from: bedtimeString),
              let wakeTime = DateFormatting.isoDateTime(from: wakeTimeString)
        else { return }
        let alreadyInHealth = healthImportDateCounts[latest.entryDate] != nil
        Task {
            await HealthKitService.shared.syncLatestSleep(
                bedtime: bedtime,
                wakeTime: wakeTime,
                entryDate: latest.entryDate,
                alreadyInHealth: alreadyInHealth
            )
        }
    }
}
