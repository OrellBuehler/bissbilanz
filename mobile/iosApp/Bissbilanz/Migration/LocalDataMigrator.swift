import Foundation
import Observation
import SwiftData

/// What would be uploaded by `LocalDataMigrator.migrate`, counted from the local store.
struct MigrationPlan {
    let foods: Int
    let recipes: Int
    let entries: Int
    let weights: Int
    let sleepEntries: Int
    let supplements: Int
    let supplementLogs: Int
    let dayProperties: Int
    let hasGoals: Bool
    let hasPreferences: Bool

    var total: Int {
        foods + recipes + entries + weights + sleepEntries + supplements + supplementLogs
            + dayProperties + (hasGoals ? 1 : 0) + (hasPreferences ? 1 : 0)
    }
}

enum MigrationStep: String {
    case prepare
    case foods
    case recipes
    case entries
    case weights
    case sleep
    case supplements
    case supplementLogs = "supplement_logs"
    case goals
    case preferences
    case dayProperties = "day_properties"
}

enum MigrationState: Equatable {
    case idle
    case running(done: Int, total: Int, step: MigrationStep)
    case completed
    case failed(String)
}

/// One-shot upload of the local (anonymous) store to a freshly logged-in
/// account, mirroring the Android `LocalDataMigrator`.
///
/// Algorithm:
/// 1. Defensively clear the sync queue (it must already be empty in Local mode;
///    queued ops would double-apply what this migrator uploads from the store).
/// 2. Normalize: every local row whose id does NOT start with `temp_` is
///    re-keyed to a fresh `temp_` UUID (stale leftovers from an earlier synced
///    session — logout does not wipe the store). References are rewritten with
///    the row via `LocalRemap`. After this pass "`temp_` prefix == not yet
///    uploaded" holds, which makes a failed run resumable. Normalization runs
///    once per migration cycle — a UserDefaults marker skips it on retries so
///    rows that already received server ids from a partial run are not
///    re-keyed (and re-uploaded) again. The marker is cleared on success and
///    by `discardLocalData`.
/// 3. Upload in dependency order — foods, recipes, entries, weights,
///    supplements, supplement logs, goals, preferences, day properties. After
///    every successful create the local row is immediately replaced with the
///    server record and all local references re-keyed, so recipe/supplement
///    ingredients and entry references point at server ids by the time their
///    owning row uploads. Dangling references (food deleted locally) still
///    carry a `temp_` id at upload time: entries fall back to a quick entry
///    built from the cached display values, ingredients are dropped.
/// 4. Only after everything succeeded the mode flips to `.synced`.
/// 5. Any failure aborts the run (`.failed`) with all partial progress
///    preserved locally — calling `migrate` again resumes by uploading only
///    the remaining `temp_` rows. Goals, preferences and day properties have
///    no ids; they are idempotent set-calls and simply re-run.
@MainActor
@Observable
final class LocalDataMigrator {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let syncManager: SyncManager
    private let defaults: UserDefaults

    private(set) var state: MigrationState = .idle

    @ObservationIgnored private var isMigrating = false

    private static let normalizedMarkerKey = "migration_normalized"

    init(
        context: ModelContext,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        syncManager: SyncManager,
        defaults: UserDefaults = .standard
    ) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
        self.defaults = defaults
    }

    // MARK: - Plan / preflight

    /// Counts the local rows that `migrate` would upload.
    func plan() -> MigrationPlan {
        MigrationPlan(
            foods: count(LocalFood.self),
            recipes: count(LocalRecipe.self),
            entries: count(LocalEntry.self),
            weights: count(LocalWeightEntry.self),
            sleepEntries: count(LocalSleepEntry.self),
            supplements: count(LocalSupplement.self),
            supplementLogs: count(LocalSupplementLog.self),
            dayProperties: count(LocalDayProperties.self),
            hasGoals: count(LocalGoals.self) > 0,
            hasPreferences: count(LocalPreferences.self) > 0
        )
    }

    /// True when the account already has foods or logged entries (cheap API checks).
    func serverHasData() async throws -> Bool {
        if try await !api.getFoods(limit: 1).isEmpty {
            return true
        }
        return try await !api.getRecentFoods(limit: 1).isEmpty
    }

    // MARK: - Migration

    /// Uploads the local store to the account. Safe to call again after a failure.
    func migrate() async {
        guard !isMigrating else { return }
        isMigrating = true
        defer { isMigrating = false }

        let total = plan().total
        do {
            state = .running(done: 0, total: total, step: .prepare)
            syncManager.clearQueue()
            normalizeOnce()
            var done = uploadedCount()
            done = try await uploadFoods(done: done, total: total)
            done = try await uploadRecipes(done: done, total: total)
            done = try await uploadEntries(done: done, total: total)
            done = try await uploadWeights(done: done, total: total)
            done = try await uploadSleep(done: done, total: total)
            done = try await uploadSupplements(done: done, total: total)
            done = try await uploadSupplementLogs(done: done, total: total)
            done = try await uploadGoals(done: done, total: total)
            done = try await uploadPreferences(done: done, total: total)
            _ = try await uploadDayProperties(done: done, total: total)
            defaults.removeObject(forKey: Self.normalizedMarkerKey)
            appMode.setMode(.synced)
            state = .completed
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Wipes all local user data and the sync queue (the user chose "start
    /// fresh"), then flips the mode to `.synced`.
    func discardLocalData() {
        wipeLocalData()
        appMode.setMode(.synced)
    }

    /// Wipes every local user-data model, the pending sync queue and the
    /// normalization marker — without touching tokens or the app mode. Used
    /// by `discardLocalData` and by the Settings sign-out (the local store
    /// belongs to the signed-out account and must not leak into the next
    /// session).
    func wipeLocalData() {
        syncManager.clearQueue()
        try? context.delete(model: LocalEntry.self)
        try? context.delete(model: LocalFood.self)
        try? context.delete(model: LocalRecipe.self)
        try? context.delete(model: LocalWeightEntry.self)
        try? context.delete(model: LocalSleepEntry.self)
        try? context.delete(model: LocalSupplement.self)
        try? context.delete(model: LocalSupplementLog.self)
        try? context.delete(model: LocalGoals.self)
        try? context.delete(model: LocalPreferences.self)
        try? context.delete(model: LocalDayProperties.self)
        try? context.save()
        defaults.removeObject(forKey: Self.normalizedMarkerKey)
    }

    /// The user abandoned a (possibly partially run) migration and stays in
    /// Local mode with their data. Clears the normalization marker: rows that
    /// already received server ids from the abandoned run must be re-keyed
    /// (and re-uploaded) when a later sign-in — possibly into a different
    /// account — migrates again, instead of being mistaken for uploaded.
    func abandonMigration() {
        defaults.removeObject(forKey: Self.normalizedMarkerKey)
        state = .idle
    }

    // MARK: - Normalization

    /// Re-keys every non-`temp_` row to a fresh temp id (with reference
    /// rewriting) so the temp prefix reliably means "not uploaded yet".
    private func normalizeOnce() {
        guard !defaults.bool(forKey: Self.normalizedMarkerKey) else { return }

        for row in fetchAll(LocalFood.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let food = row.toFood(),
               let patched = try? JSONPatch.merged(Food.self, base: food, patch: ["id": newId])
            {
                LocalRemap.replaceFood(id: row.id, with: patched, in: context)
            }
        }
        for row in fetchAll(LocalRecipe.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let recipe = row.toRecipe(),
               let patched = try? JSONPatch.merged(Recipe.self, base: recipe, patch: ["id": newId])
            {
                LocalRemap.replaceRecipe(id: row.id, with: patched, in: context)
            }
        }
        for row in fetchAll(LocalSupplement.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let supplement = row.toSupplement(),
               let patched = try? JSONPatch.merged(Supplement.self, base: supplement, patch: ["id": newId])
            {
                LocalRemap.replaceSupplement(id: row.id, with: patched, rekeyLogIds: true, in: context)
            }
        }
        for row in fetchAll(LocalEntry.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let entry = row.toEntry(),
               let patched = try? JSONPatch.merged(Entry.self, base: entry, patch: ["id": newId])
            {
                LocalRemap.replaceEntry(id: row.id, with: patched, date: row.date, in: context)
            }
        }
        for row in fetchAll(LocalWeightEntry.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let entry = row.toWeightEntry(),
               let patched = try? JSONPatch.merged(WeightEntry.self, base: entry, patch: ["id": newId])
            {
                LocalRemap.replaceWeight(id: row.id, with: patched, in: context)
            }
        }
        for row in fetchAll(LocalSleepEntry.self) where !LocalStore.isTempId(row.id) {
            let newId = LocalStore.makeTempId()
            if let entry = row.toSleepEntry(),
               let patched = try? JSONPatch.merged(SleepEntry.self, base: entry, patch: ["id": newId])
            {
                LocalRemap.replaceSleep(id: row.id, with: patched, in: context)
            }
        }
        try? context.save()
        defaults.set(true, forKey: Self.normalizedMarkerKey)
    }

    /// Items already carrying server ids from a previous partial run.
    private func uploadedCount() -> Int {
        fetchAll(LocalFood.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalRecipe.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalEntry.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalWeightEntry.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalSleepEntry.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalSupplement.self).count { !LocalStore.isTempId($0.id) }
            + fetchAll(LocalSupplementLog.self).count { !LocalStore.isTempId($0.id) }
    }

    // MARK: - Upload steps

    private func progress(_ done: Int, _ total: Int, _ step: MigrationStep) {
        state = .running(done: done, total: total, step: step)
    }

    /// Stable `Idempotency-Key` for one migrated row.
    ///
    /// The migration is a serial, resumable, one-request-per-row upload — the
    /// highest-volume retry surface in the app — so a response lost to a
    /// timeout or a backgrounded app would otherwise create a duplicate on the
    /// next `migrate()`. The local `temp_` id is the right seed: it survives
    /// every retry (a row is only re-keyed once its upload succeeded) and
    /// `normalizeOnce` mints fresh ones after `abandonMigration`, so migrating
    /// into a different account never replays the abandoned run's responses.
    /// The scope keeps two endpoints from sharing a key, since the server
    /// stores responses per (user, key) alone.
    private static func migrationKey(_ scope: String, _ localId: String) -> String {
        "migrate-\(scope)-\(localId)"
    }

    private func uploadFoods(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .foods)
        for row in fetchAll(LocalFood.self) where LocalStore.isTempId(row.id) {
            guard let food = row.toFood(),
                  let create = try? JSONPatch.decode(FoodCreate.self, from: JSONPatch.dictionary(of: food))
            else {
                throw MigrationError.unreadableRow("food \"\(row.name)\"")
            }
            let server = try await api.createFood(
                create,
                idempotencyKey: Self.migrationKey("food", row.id)
            )
            LocalRemap.replaceFood(id: row.id, with: server, in: context)
            done += 1
            progress(done, total, .foods)
        }
        return done
    }

    private func uploadRecipes(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .recipes)
        for row in fetchAll(LocalRecipe.self) where LocalStore.isTempId(row.id) {
            guard let recipe = row.toRecipe() else {
                throw MigrationError.unreadableRow("recipe \"\(row.name)\"")
            }
            let create = RecipeCreate(
                name: recipe.name,
                totalServings: recipe.totalServings,
                ingredients: (recipe.ingredients ?? [])
                    // Dangling food references (food deleted locally) are dropped.
                    .filter { !LocalStore.isTempId($0.foodId) }
                    .map { RecipeIngredientInput(foodId: $0.foodId, quantity: $0.quantity, servingUnit: $0.servingUnit)
                    },
                isFavorite: recipe.isFavorite,
                imageUrl: recipe.imageUrl
            )
            let server = try await api.createRecipe(
                create,
                idempotencyKey: Self.migrationKey("recipe", row.id)
            )
            LocalRemap.replaceRecipe(id: row.id, with: server, in: context)
            done += 1
            progress(done, total, .recipes)
        }
        return done
    }

    private func uploadEntries(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .entries)
        for row in fetchAll(LocalEntry.self) where LocalStore.isTempId(row.id) {
            guard let entry = row.toEntry() else {
                throw MigrationError.unreadableRow("entry from \(row.date)")
            }
            let server = try await api.createEntry(
                Self.entryCreate(from: entry, date: row.date),
                idempotencyKey: Self.migrationKey("entry", row.id)
            )
            let merged = EntryRepository.merge(server: server, local: entry)
            LocalRemap.replaceEntry(id: row.id, with: merged, date: row.date, in: context)
            done += 1
            progress(done, total, .entries)
        }
        return done
    }

    private func uploadWeights(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .weights)
        for row in fetchAll(LocalWeightEntry.self) where LocalStore.isTempId(row.id) {
            guard let entry = row.toWeightEntry() else {
                throw MigrationError.unreadableRow("weight entry from \(row.entryDate)")
            }
            let server = try await api.createWeightEntry(
                WeightCreate(weightKg: entry.weightKg, entryDate: entry.entryDate, notes: entry.notes),
                idempotencyKey: Self.migrationKey("weight", row.id)
            )
            LocalRemap.replaceWeight(id: row.id, with: server, in: context)
            done += 1
            progress(done, total, .weights)
        }
        return done
    }

    private func uploadSleep(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .sleep)
        for row in fetchAll(LocalSleepEntry.self) where LocalStore.isTempId(row.id) {
            guard let entry = row.toSleepEntry() else {
                throw MigrationError.unreadableRow("sleep entry from \(row.entryDate)")
            }
            let server = try await api.createSleepEntry(
                SleepCreate(
                    durationMinutes: entry.durationMinutes,
                    quality: entry.quality,
                    entryDate: entry.entryDate,
                    bedtime: entry.bedtime,
                    wakeTime: entry.wakeTime,
                    wakeUps: entry.wakeUps,
                    notes: entry.notes
                ),
                idempotencyKey: Self.migrationKey("sleep", row.id)
            )
            LocalRemap.replaceSleep(id: row.id, with: server, in: context)
            done += 1
            progress(done, total, .sleep)
        }
        return done
    }

    private func uploadSupplements(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .supplements)
        for row in fetchAll(LocalSupplement.self) where LocalStore.isTempId(row.id) {
            guard let supplement = row.toSupplement() else {
                throw MigrationError.unreadableRow("supplement \"\(row.name)\"")
            }
            let create = SupplementCreate(
                name: supplement.name,
                scheduleType: supplement.scheduleType,
                scheduleDays: supplement.scheduleDays,
                scheduleStartDate: supplement.scheduleStartDate,
                isActive: supplement.isActive,
                sortOrder: supplement.sortOrder,
                timeOfDay: supplement.timeOfDay,
                ingredients: supplement.ingredients.map { ingredient in
                    if LocalStore.isTempId(ingredient.foodId) {
                        // Local-only backing food (the Local-mode supplement
                        // editor materializes inline inputs with synthetic
                        // temp ids) — upload it inline, like the editor would.
                        SupplementIngredientInput(
                            foodId: nil,
                            food: SupplementBackingFoodInput(
                                name: ingredient.food.name,
                                servingSize: ingredient.food.servingSize,
                                servingUnit: ingredient.food.servingUnit,
                                calories: ingredient.food.calories,
                                protein: ingredient.food.protein,
                                carbs: ingredient.food.carbs,
                                fat: ingredient.food.fat,
                                fiber: ingredient.food.fiber,
                                ingredientsText: ingredient.food.ingredientsText
                            ),
                            servings: ingredient.servings,
                            sortOrder: ingredient.sortOrder
                        )
                    } else {
                        SupplementIngredientInput(
                            foodId: ingredient.foodId,
                            servings: ingredient.servings,
                            sortOrder: ingredient.sortOrder
                        )
                    }
                }
            )
            let server = try await api.createSupplement(
                create,
                idempotencyKey: Self.migrationKey("supplement", row.id)
            )
            LocalRemap.replaceSupplement(id: row.id, with: server, rekeyLogIds: false, in: context)
            done += 1
            progress(done, total, .supplements)
        }
        return done
    }

    private func uploadSupplementLogs(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .supplementLogs)
        for row in fetchAll(LocalSupplementLog.self) where LocalStore.isTempId(row.id) {
            if LocalStore.isTempId(row.supplementId) {
                // Orphan log (supplement deleted locally) — nothing to log it against.
                context.delete(row)
                try? context.save()
                done += 1
                progress(done, total, .supplementLogs)
                continue
            }
            _ = try await api.logSupplement(
                id: row.supplementId,
                date: row.date,
                idempotencyKey: Self.migrationKey("supplement-log", row.id)
            )
            let uploaded = LocalSupplementLog(supplementId: row.supplementId, date: row.date, takenAt: row.takenAt)
            context.delete(row)
            context.insert(uploaded)
            try? context.save()
            done += 1
            progress(done, total, .supplementLogs)
        }
        return done
    }

    private func uploadGoals(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        guard let goals = fetchAll(LocalGoals.self).first?.toGoals() else { return done }
        progress(done, total, .goals)
        _ = try await api.setGoals(goals)
        done += 1
        progress(done, total, .goals)
        return done
    }

    private func uploadPreferences(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        guard let preferences = fetchAll(LocalPreferences.self).first?.toPreferences() else { return done }
        progress(done, total, .preferences)
        _ = try await api.updatePreferences(Self.preferencesUpdate(from: preferences))
        done += 1
        progress(done, total, .preferences)
        return done
    }

    private func uploadDayProperties(done startDone: Int, total: Int) async throws -> Int {
        var done = startDone
        progress(done, total, .dayProperties)
        for row in fetchAll(LocalDayProperties.self) {
            let server = try await api.setDayProperties(date: row.date, isFastingDay: row.isFastingDay)
            row.update(from: server)
            try? context.save()
            done += 1
            progress(done, total, .dayProperties)
        }
        return done
    }

    // MARK: - Model mapping

    /// copyEntries-style mapping. Food/recipe references that are still
    /// unresolved (`temp_` id) fall back to a quick entry built from the
    /// cached display values so the log line survives the migration.
    static func entryCreate(from entry: Entry, date: String) -> EntryCreate {
        let resolvedFoodId = entry.foodId.flatMap { LocalStore.isTempId($0) ? nil : $0 }
        let resolvedRecipeId = entry.recipeId.flatMap { LocalStore.isTempId($0) ? nil : $0 }
        let orphan = (entry.foodId != nil && resolvedFoodId == nil)
            || (entry.recipeId != nil && resolvedRecipeId == nil)
        return EntryCreate(
            foodId: resolvedFoodId,
            recipeId: resolvedRecipeId,
            mealType: entry.mealType,
            servings: entry.servings,
            date: entry.date ?? date,
            notes: entry.notes,
            quickName: entry.quickName ?? (orphan ? entry.foodName : nil),
            quickCalories: entry.quickCalories ?? (orphan ? entry.calories : nil),
            quickProtein: entry.quickProtein ?? (orphan ? entry.protein : nil),
            quickCarbs: entry.quickCarbs ?? (orphan ? entry.carbs : nil),
            quickFat: entry.quickFat ?? (orphan ? entry.fat : nil),
            quickFiber: entry.quickFiber ?? (orphan ? entry.fiber : nil),
            eatenAt: entry.eatenAt
        )
    }

    /// Empty lists are sent as `nil` (server default wins) because the local
    /// default state is indistinguishable from "user cleared everything".
    static func preferencesUpdate(from preferences: Preferences) -> PreferencesUpdate {
        var update = PreferencesUpdate()
        update.showChartWidget = preferences.showChartWidget
        update.showFavoritesWidget = preferences.showFavoritesWidget
        update.showSupplementsWidget = preferences.showSupplementsWidget
        update.showWeightWidget = preferences.showWeightWidget
        update.showMealBreakdownWidget = preferences.showMealBreakdownWidget
        update.showTopFoodsWidget = preferences.showTopFoodsWidget
        update.showSleepWidget = preferences.showSleepWidget
        update.widgetOrder = preferences.widgetOrder.isEmpty ? nil : preferences.widgetOrder
        update.startPage = preferences.startPage
        update.favoriteTapAction = preferences.favoriteTapAction
        update.favoriteMealAssignmentMode = preferences.favoriteMealAssignmentMode
        update.visibleNutrients = preferences.visibleNutrients.isEmpty ? nil : preferences.visibleNutrients
        update.locale = preferences.locale
        update.timeZone = preferences.timeZone
        return update
    }

    // MARK: - Store helpers

    private func fetchAll<T: PersistentModel>(_ type: T.Type) -> [T] {
        (try? context.fetch(FetchDescriptor<T>())) ?? []
    }

    private func count<T: PersistentModel>(_ type: T.Type) -> Int {
        (try? context.fetchCount(FetchDescriptor<T>())) ?? 0
    }
}

enum MigrationError: LocalizedError {
    case unreadableRow(String)

    var errorDescription: String? {
        switch self {
        case let .unreadableRow(what): "Could not read local \(what)"
        }
    }
}
