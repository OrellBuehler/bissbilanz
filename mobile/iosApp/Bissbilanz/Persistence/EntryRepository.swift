import Foundation
import Observation
import SwiftData

/// Local-first repository for food entries and day properties.
///
/// Reads come from SwiftData and `refresh(date:)` replaces the cached day with
/// the server response (mirroring Android's `cacheEntries`). Writes are
/// SwiftData-first: the local row is written immediately and the API call is
/// queued via the sync manager. In Synced mode the queue drains right away
/// when online and replaces optimistic `temp_` rows with server records; in
/// Local mode nothing is enqueued, refresh is a no-op and temp ids stay until
/// the login migration uploads them.
@MainActor
@Observable
final class EntryRepository {
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

    func entries(date: String) -> [Entry] {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date == date })
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toEntry() }.sorted { lhs, rhs in
            let l = lhs.createdAt ?? lhs.eatenAt ?? ""
            let r = rhs.createdAt ?? rhs.eatenAt ?? ""
            if l != r { return l < r }
            return lhs.id < rhs.id
        }
    }

    /// A whole date span in one fetch, grouped by day. The dashboard's trend
    /// and top-foods cards walk a week at a time and used to run one
    /// `entries(date:)` per day — seven synchronous SwiftData fetches on the
    /// main actor for the app's most-used screen. Unsorted: both callers
    /// aggregate rather than list.
    func entriesByDate(from startDate: String, to endDate: String) -> [String: [Entry]] {
        let descriptor = FetchDescriptor<LocalEntry>(
            predicate: #Predicate { $0.date >= startDate && $0.date <= endDate }
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        return Dictionary(grouping: rows, by: \.date).mapValues { dayRows in
            dayRows.compactMap { $0.toEntry() }
        }
    }

    /// Local month aggregation for the calendar (used in Local mode, where
    /// the local store holds every entry).
    func calendarDays(year: Int, month: Int, calorieGoal: Double?) -> [CalendarDay] {
        let monthPrefix = String(format: "%04d-%02d-", year, month)
        let start = monthPrefix + "01"
        let end = monthPrefix + "31"
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date >= start && $0.date <= end })
        let rows = (try? context.fetch(descriptor)) ?? []
        return Dictionary(grouping: rows, by: \.date)
            .map { date, dayRows in
                let calories = dayRows.reduce(0.0) { $0 + $1.calories * $1.servings }
                let hasGoal = calorieGoal != nil
                return CalendarDay(
                    date: date,
                    calories: calories,
                    hasGoal: hasGoal,
                    metGoal: hasGoal && calories > 0 && calories <= (calorieGoal ?? 0)
                )
            }
            .sorted { $0.date < $1.date }
    }

    // MARK: - Refresh (API → store)

    func refresh(date: String) async throws {
        guard !appMode.isLocal else {
            // No server to pull from, but the local store may have changed
            // outside the repository (widget quick-adds) — re-sync Health so
            // those entries aren't lost until the next in-app mutation.
            syncDayToHealth(date)
            return
        }
        let fetched = try await api.getEntries(date: date)
        // Preserve local rows the server response must not clobber: optimistic
        // `temp_` creates (their queued creates replace them on drain) and any
        // row with an un-uploaded queued write. A forced refresh right after an
        // edit (see DayLogView.loadEntries) races the async sync-queue upload,
        // so the still-stale server row would otherwise overwrite the edit until
        // the next manual refresh.
        let pendingIds = syncManager.pendingAffectedIds(table: "entries")
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date == date })
        // Keyed off the bulk fetch the delete pass already needs, so the upsert
        // below doesn't run a `fetchRow(id:)` of its own per server row.
        var rowsById = Dictionary(
            ((try? context.fetch(descriptor)) ?? []).map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for (id, row) in rowsById where !LocalStore.isTempId(id) && !pendingIds.contains(id) {
            context.delete(row)
            rowsById.removeValue(forKey: id)
        }
        for entry in fetched where !pendingIds.contains(entry.id) {
            if let row = rowsById[entry.id] {
                row.update(from: entry, date: date)
            } else {
                let row = LocalEntry(entry: entry, date: date)
                context.insert(row)
                rowsById[entry.id] = row
            }
        }
        save()
        // Entries logged outside this device (web, MCP, Android) only reach the
        // app through this refresh — push the day to Health here too, or its
        // totals stay frozen at the last in-app mutation. The unchanged-day
        // guard in syncNutrition keeps repeated refreshes free.
        syncDayToHealth(date)
    }

    /// Replaces the cached entries for a whole date span in one request.
    ///
    /// `refresh(date:)` pulls a single day, which is all the day log needs; the
    /// insights screen needs up to 90 days at once and would otherwise compute
    /// over whichever days the user happened to have visited. Conflict handling
    /// matches the per-day refresh exactly — optimistic `temp_` rows and rows
    /// with an un-uploaded queued write survive the server response.
    ///
    /// Deliberately does not push to Health: that is a per-day diff, and running
    /// it 90 times for a backfill would cost far more than it is worth. Days the
    /// user actually opens still sync through `refresh(date:)`.
    func refreshRange(startDate: String, endDate: String) async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getEntriesRange(startDate: startDate, endDate: endDate)

        let pendingIds = syncManager.pendingAffectedIds(table: "entries")
        let descriptor = FetchDescriptor<LocalEntry>(
            predicate: #Predicate { $0.date >= startDate && $0.date <= endDate }
        )
        var rowsById = Dictionary(
            ((try? context.fetch(descriptor)) ?? []).map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for (id, row) in rowsById where !LocalStore.isTempId(id) && !pendingIds.contains(id) {
            context.delete(row)
            rowsById.removeValue(forKey: id)
        }
        for entry in fetched where !pendingIds.contains(entry.id) {
            // The range endpoint carries the date on each entry; skip anything
            // that somehow lacks one rather than filing it under the wrong day.
            guard let date = entry.date else { continue }
            if let row = rowsById[entry.id] {
                row.update(from: entry, date: date)
            } else {
                let row = LocalEntry(entry: entry, date: date)
                context.insert(row)
                rowsById[entry.id] = row
            }
        }
        save()
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createEntry(_ create: EntryCreate, food: Food? = nil, recipe: Recipe? = nil) async throws -> Entry {
        let temp = Self.makeEntry(from: create, id: LocalStore.makeTempId(), food: food, recipe: recipe)
        upsert(temp, date: create.date)
        save()
        syncManager.enqueue(.createEntry(body: create, localId: temp.id))
        syncDayToHealth(create.date, knownFood: food)
        // Feed Siri suggestions / Spotlight when a known food or recipe was
        // logged. No-op outside the app (e.g. in tests) — see IntentDonations.
        if food != nil || recipe != nil {
            IntentDonations.donateLog(food: food, recipe: recipe, mealType: create.mealType)
        }
        return temp
    }

    /// A missing local row means the record is gone (deleted elsewhere, or
    /// never cached) — the failure is reported without also queueing an upload
    /// for it. Enqueuing first and throwing afterwards told the caller the edit
    /// had failed while it was already on its way to the server, so the next
    /// refresh brought back the change the UI had just reported as failed.
    @discardableResult
    func updateEntry(id: String, _ update: EntryUpdate) async throws -> Entry {
        guard let row = fetchRow(id: id), let existing = row.toEntry() else {
            throw APIError.notFound
        }
        let previousDate = row.date
        let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        let updated = (try? JSONPatch.merged(Entry.self, base: existing, patch: patch)) ?? existing
        row.update(from: updated, date: update.date ?? row.date)
        save()
        if LocalStore.isTempId(id) {
            // The row hasn't been uploaded — rewrite the queued create instead.
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateEntry(id: id, body: update))
        }
        // Re-sync the affected day — both days when the entry moved dates.
        let currentDate = update.date ?? previousDate
        syncDayToHealth(currentDate)
        if previousDate != currentDate {
            syncDayToHealth(previousDate)
        }
        return updated
    }

    func deleteEntry(id: String) async throws {
        let date = fetchRow(id: id)?.date
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "entries", affectedId: id)
        } else {
            syncManager.enqueue(.deleteEntry(id: id))
        }
        if let date {
            syncDayToHealth(date)
        }
    }

    /// Client-side copy (mirrors the Android repository): each source entry is
    /// re-created locally for the target day and queued for upload, so the
    /// copy works offline and in Local mode. Returns the number copied.
    @discardableResult
    func copyEntries(fromDate: String, toDate: String) async throws -> Int {
        let source = entries(date: fromDate)
        // Right after an upgrade the local store may not hold the source day
        // yet — in Synced mode fall back to the server-side copy (main
        // parity) and cache the results.
        if source.isEmpty, !appMode.isLocal {
            let serverCopies = try await api.copyEntries(fromDate: fromDate, toDate: toDate)
            for entry in serverCopies {
                upsert(entry, date: entry.date ?? toDate)
            }
            save()
            syncDayToHealth(toDate)
            return serverCopies.count
        }
        var copied = 0
        for entry in source {
            let create = EntryCreate(
                foodId: entry.foodId,
                recipeId: entry.recipeId,
                mealType: entry.mealType,
                servings: entry.servings,
                date: toDate,
                notes: entry.notes,
                quickName: entry.quickName,
                quickCalories: entry.quickCalories,
                quickProtein: entry.quickProtein,
                quickCarbs: entry.quickCarbs,
                quickFat: entry.quickFat,
                quickFiber: entry.quickFiber,
                quickNutrients: entry.quickNutrients,
                eatenAt: entry.eatenAt
            )
            // Patch the source entry instead of rebuilding so resolved display
            // macros survive the copy.
            let tempId = LocalStore.makeTempId()
            let copy = (try? JSONPatch.merged(Entry.self, base: entry, patch: [
                "id": tempId,
                "date": toDate,
                "createdAt": DateFormatting.isoDateTimeString(from: Date()),
            ])) ?? Self.makeEntry(from: create, id: tempId, food: nil, recipe: nil)
            upsert(copy, date: toDate)
            syncManager.enqueue(.createEntry(body: create, localId: copy.id))
            copied += 1
        }
        // One transaction for the whole day, not one per entry.
        if copied > 0 {
            save()
            syncDayToHealth(toDate)
        }
        return copied
    }

    /// Rewrites the still-queued create for a temp-id entry so the eventual
    /// upload carries the edited values. If the create has already drained
    /// (no queued op found), the edit stays local-only — the temp id is
    /// unknown server-side.
    private func coalesceQueuedCreate(tempId: String, update: EntryUpdate) {
        for row in syncManager.queuedOperations(table: "entries", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createEntry(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(EntryCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createEntry(body: merged, localId: localId))
        }
    }

    // MARK: - Apple Health write-back

    /// Rewrites the day's nutrition totals in Apple Health after a mutation.
    /// Fire-and-forget like the weight and sleep write-backs — Health errors
    /// never surface as logging failures.
    private func syncDayToHealth(_ date: String, knownFood: Food? = nil) {
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable, HealthNutrient.anyEnabled else { return }
        let dayEntries = entries(date: date)
        var foods: [String: Food] = [:]
        if let knownFood {
            foods[knownFood.id] = knownFood
        }
        for id in Set(dayEntries.compactMap(\.foodId)) where foods[id] == nil {
            if let food = fetchFoodRow(id: id)?.toFood() {
                foods[id] = food
            }
        }
        Task {
            await healthKit.syncNutrition(date: date, entries: dayEntries, foods: foods)
        }
    }

    private func fetchFoodRow(id: String) -> LocalFood? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    // MARK: - Day properties

    func isFastingDay(date: String) -> Bool {
        fetchDayPropertiesRow(date: date)?.isFastingDay ?? false
    }

    func refreshDayProperties(date: String) async throws {
        guard !appMode.isLocal else { return }
        if let properties = try await api.getDayProperties(date: date) {
            upsertDayProperties(properties)
        } else if let row = fetchDayPropertiesRow(date: date) {
            context.delete(row)
        }
        save()
    }

    func setDayProperties(date: String, isFastingDay: Bool) async throws {
        upsertDayProperties(DayProperties(date: date, isFastingDay: isFastingDay))
        save()
        syncManager.enqueue(.setDayProperties(date: date, isFastingDay: isFastingDay))
    }

    func deleteDayProperties(date: String) async throws {
        if let row = fetchDayPropertiesRow(date: date) {
            context.delete(row)
            save()
        }
        syncManager.enqueue(.deleteDayProperties(date: date))
    }

    // MARK: - Conversion helpers

    static func makeEntry(from create: EntryCreate, id: String, food: Food?, recipe: Recipe?) -> Entry {
        EntryFactory.makeEntry(from: create, id: id, food: food, recipe: recipe)
    }

    /// Server rows win where present; resolved display fields missing from raw
    /// POST/PATCH responses fall back to the optimistic local entry.
    static func merge(server: Entry, local: Entry) -> Entry {
        Entry(
            id: server.id,
            mealType: server.mealType,
            servings: server.servings,
            notes: server.notes ?? local.notes,
            foodId: server.foodId ?? local.foodId,
            recipeId: server.recipeId ?? local.recipeId,
            supplementId: server.supplementId ?? local.supplementId,
            quickName: server.quickName ?? local.quickName,
            quickCalories: server.quickCalories ?? local.quickCalories,
            quickProtein: server.quickProtein ?? local.quickProtein,
            quickCarbs: server.quickCarbs ?? local.quickCarbs,
            quickFat: server.quickFat ?? local.quickFat,
            quickFiber: server.quickFiber ?? local.quickFiber,
            quickNutrients: server.quickNutrients ?? local.quickNutrients,
            foodName: server.foodName ?? local.foodName,
            calories: server.calories ?? local.calories,
            protein: server.protein ?? local.protein,
            carbs: server.carbs ?? local.carbs,
            fat: server.fat ?? local.fat,
            fiber: server.fiber ?? local.fiber,
            servingSize: server.servingSize ?? local.servingSize,
            servingUnit: server.servingUnit ?? local.servingUnit,
            date: server.date ?? local.date,
            eatenAt: server.eatenAt ?? local.eatenAt,
            createdAt: server.createdAt ?? local.createdAt,
            updatedAt: server.updatedAt ?? local.updatedAt
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalEntry? {
        var descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ entry: Entry, date: String) {
        if let row = fetchRow(id: entry.id) {
            row.update(from: entry, date: date)
        } else {
            context.insert(LocalEntry(entry: entry, date: date))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func fetchDayPropertiesRow(date: String) -> LocalDayProperties? {
        var descriptor = FetchDescriptor<LocalDayProperties>(predicate: #Predicate { $0.date == date })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsertDayProperties(_ properties: DayProperties) {
        if let row = fetchDayPropertiesRow(date: properties.date) {
            row.update(from: properties)
        } else {
            context.insert(LocalDayProperties(properties: properties))
        }
    }

    private func save() {
        try? context.save()
        WidgetSnapshotWriter.scheduleUpdate(context: context)
    }
}
