@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Local data migrator")
@MainActor
struct MigratorTests {
    // MARK: - Seeding helpers

    /// Seeds one row of every entity, all `temp_`-keyed, with an entry and a
    /// recipe ingredient referencing the temp food and a log referencing the
    /// temp supplement.
    private func seedLocalData(
        _ harness: RepositoryHarness,
        foodId: String = "temp_food1",
        supplementId: String = "temp_supp1"
    ) throws {
        try harness.context.insert(LocalFood(food: harness.food(id: foodId, name: "Local Rice")))
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(
            id: "temp_recipe1",
            name: "Bowl",
            ingredientFoodId: foodId
        )))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "temp_entry1", date: "2026-06-01", foodId: foodId),
            date: "2026-06-01"
        ))
        try harness.context.insert(LocalWeightEntry(entry: harness.weight(
            id: "temp_weight1",
            date: "2026-06-01",
            kg: 74
        )))
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(
            id: supplementId,
            name: "Vitamin D"
        )))
        harness.context.insert(LocalSupplementLog(
            supplementId: supplementId,
            date: "2026-06-01",
            takenAt: "2026-06-01T08:00:00Z"
        ))
        harness.context.insert(LocalGoals(goals: .defaults))
        harness.context.insert(LocalPreferences(preferences: .defaults))
        harness.context.insert(LocalDayProperties(properties: DayProperties(
            date: "2026-06-01",
            userId: "",
            isFastingDay: true
        )))
        try harness.context.save()
    }

    private func stubAllCreates(_ harness: RepositoryHarness) {
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Local Rice", "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 10, "carbs": 20, "fat": 5, "fiber": 3, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        harness.stub("POST", "/api/entries", json: """
        {"entry": {"id": "e-server", "userId": "u1", "date": "2026-06-01", "mealType": "lunch", "servings": 1}}
        """)
        harness.stub("POST", "/api/weight", json: """
        {"entry": {"id": "w-server", "userId": "u1", "weightKg": 74, "entryDate": "2026-06-01"}}
        """)
        harness.stub("POST", "/api/supplements", json: """
        {"supplement": {
            "id": "s-server", "userId": "u1", "name": "Vitamin D",
            "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []
        }}
        """)
        harness.stub("POST", "/api/supplements/s-server/log", json: """
        {"log": {"supplementId": "s-server", "date": "2026-06-01", "takenAt": "2026-06-01T08:00:00Z", "entryIds": []}}
        """)
        harness.stub("POST", "/api/goals", json: "{}")
        harness.stub("PATCH", "/api/preferences", json: """
        {
            "showChartWidget": true, "showFavoritesWidget": true, "showSupplementsWidget": true,
            "showWeightWidget": true, "showMealBreakdownWidget": true, "showTopFoodsWidget": true,
            "showSummaryWidget": true, "showDayLogWidget": true, "showStreakWidget": true,
            "widgetOrder": [], "startPage": "dashboard", "favoriteTapAction": "instant",
            "favoriteMealAssignmentMode": "time_based", "visibleNutrients": []
        }
        """)
        harness.stub("POST", "/api/day-properties/2026-06-01", json: """
        {"properties": {"date": "2026-06-01", "user_id": "u1", "is_fasting_day": true}}
        """)
    }

    // MARK: - Plan / preflight

    @Test("plan counts every local entity")
    func planCountsLocalRows() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedLocalData(harness)

        let plan = harness.migrator.plan()

        #expect(plan.foods == 1)
        #expect(plan.recipes == 1)
        #expect(plan.entries == 1)
        #expect(plan.weights == 1)
        #expect(plan.supplements == 1)
        #expect(plan.supplementLogs == 1)
        #expect(plan.dayProperties == 1)
        #expect(plan.hasGoals)
        #expect(plan.hasPreferences)
        #expect(plan.total == 9)
    }

    @Test("serverHasData checks foods, then recent foods")
    func serverHasDataChecks() async throws {
        let harness = try RepositoryHarness(mode: .local)
        harness.stub("GET", "/api/foods", json: """
        {"foods": [{
            "id": "f1", "userId": "u1", "name": "Existing", "servingSize": 100, "servingUnit": "g",
            "calories": 1, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0, "isFavorite": false
        }]}
        """)
        #expect(try await harness.migrator.serverHasData() == true)

        let empty = try RepositoryHarness(mode: .local)
        empty.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        empty.stub("GET", "/api/foods/recent", json: #"{"foods": []}"#)
        #expect(try await empty.migrator.serverHasData() == false)
    }

    // MARK: - Migration

    @Test("migrate uploads in dependency order, remaps references and flips the mode")
    func migrateUploadsInDependencyOrder() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedLocalData(harness)
        stubAllCreates(harness)
        // A stale queued op must be cleared, not double-applied.
        harness.context.insert(PendingSyncOperation(seq: 1, operation: .deleteFood(id: "f-x")))
        try harness.context.save()

        let migrator = harness.migrator
        await migrator.migrate()

        #expect(migrator.state == .completed)
        #expect(harness.appMode.mode == .synced)
        #expect(harness.syncManager.queuedRows().isEmpty)

        // Dependency order: foods → recipes → entries → weights →
        // supplements → supplement logs → goals → preferences → day props.
        let posts = harness.recordedRequests
        #expect(posts == [
            "POST /api/foods",
            "POST /api/recipes",
            "POST /api/entries",
            "POST /api/weight",
            "POST /api/supplements",
            "POST /api/supplements/s-server/log",
            "POST /api/goals",
            "PATCH /api/preferences",
            "POST /api/day-properties/2026-06-01",
        ])

        // The uploaded recipe and entry already carried the server food id.
        let recipeBody = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let recipeCreate = try JSONDecoder().decode(RecipeCreate.self, from: recipeBody)
        #expect(recipeCreate.ingredients.map(\.foodId) == ["f-server"])
        let entryBody = try #require(harness.recordedBodies("POST", "/api/entries").first)
        let entryCreate = try JSONDecoder().decode(EntryCreate.self, from: entryBody)
        #expect(entryCreate.foodId == "f-server")

        // Every local row is re-keyed to its server record.
        #expect(harness.foodRepository.food(id: "f-server") != nil)
        #expect(harness.recipeRepository.recipe(id: "r-server") != nil)
        #expect(harness.entryRepository.entries(date: "2026-06-01").map(\.id) == ["e-server"])
        #expect(harness.weightRepository.entries().map(\.id) == ["w-server"])
        #expect(harness.supplementRepository.supplements().map(\.id) == ["s-server"])
        #expect(harness.supplementRepository.loggedSupplementIds(date: "2026-06-01") == ["s-server"])
    }

    @Test("Non-temp leftovers are normalized to temp ids and uploaded")
    func normalizationRekeysServerLeftovers() async throws {
        let harness = try RepositoryHarness(mode: .local)
        // Leftovers from an earlier synced session: server-keyed rows.
        try harness.context.insert(LocalFood(food: harness.food(id: "old-server-food", name: "Leftover")))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "old-server-entry", date: "2026-06-01", foodId: "old-server-food"),
            date: "2026-06-01"
        ))
        try harness.context.save()
        stubAllCreates(harness)

        let migrator = harness.migrator
        await migrator.migrate()

        #expect(migrator.state == .completed)
        #expect(harness.recordedRequests == ["POST /api/foods", "POST /api/entries"])
        #expect(harness.foodRepository.food(id: "f-server") != nil)
        #expect(harness.foodRepository.food(id: "old-server-food") == nil)
        // The entry reference followed the food through normalize + upload.
        let entryBody = try #require(harness.recordedBodies("POST", "/api/entries").first)
        let entryCreate = try JSONDecoder().decode(EntryCreate.self, from: entryBody)
        #expect(entryCreate.foodId == "f-server")
    }

    @Test("A failed run resumes by uploading only the remaining temp rows")
    func failedRunResumes() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try harness.context.insert(LocalFood(food: harness.food(id: "temp_food1", name: "Local Rice")))
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(
            id: "temp_recipe1",
            name: "Bowl",
            ingredientFoodId: "temp_food1"
        )))
        try harness.context.save()
        stubAllCreates(harness)
        harness.stub("POST", "/api/recipes", status: 500, json: #"{"error": "boom"}"#)

        let migrator = harness.migrator
        await migrator.migrate()

        guard case .failed = migrator.state else {
            Issue.record("expected the migration to fail on the recipe upload")
            return
        }
        // Partial progress is preserved: the food already has its server id.
        #expect(harness.appMode.mode == .local)
        #expect(harness.foodRepository.food(id: "f-server") != nil)
        #expect(harness.recipeRepository.recipes().allSatisfy { LocalStore.isTempId($0.id) })

        // Retry: only the recipe uploads — the food is not re-keyed or re-sent.
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)
        await migrator.migrate()

        #expect(migrator.state == .completed)
        #expect(harness.appMode.mode == .synced)
        #expect(harness.recordedRequests.count(where: { $0 == "POST /api/foods" }) == 1)
        #expect(harness.recordedRequests.count(where: { $0 == "POST /api/recipes" }) == 2)
        #expect(harness.recipeRepository.recipe(id: "r-server") != nil)
    }

    @Test("Dangling references upload as quick entries and dropped ingredients")
    func danglingReferencesDegradeGracefully() async throws {
        let harness = try RepositoryHarness(mode: .local)
        // Entry + recipe reference a food that no longer exists locally.
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(
            id: "temp_recipe1",
            name: "Bowl",
            ingredientFoodId: "temp_gone"
        )))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "temp_entry1", date: "2026-06-01", foodId: "temp_gone"),
            date: "2026-06-01"
        ))
        try harness.context.save()
        stubAllCreates(harness)

        let migrator = harness.migrator
        await migrator.migrate()

        #expect(migrator.state == .completed)
        let recipeBody = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let recipeCreate = try JSONDecoder().decode(RecipeCreate.self, from: recipeBody)
        #expect(recipeCreate.ingredients.isEmpty)
        let entryBody = try #require(harness.recordedBodies("POST", "/api/entries").first)
        let entryCreate = try JSONDecoder().decode(EntryCreate.self, from: entryBody)
        #expect(entryCreate.foodId == nil)
        #expect(entryCreate.quickName == "Seed temp_entry1") // display fallback
        #expect(entryCreate.quickCalories == 100)
    }

    @Test("discardLocalData wipes the store and queue, then flips to synced")
    func discardWipesEverything() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedLocalData(harness)
        harness.context.insert(PendingSyncOperation(seq: 1, operation: .deleteFood(id: "f-x")))
        try harness.context.save()

        harness.migrator.discardLocalData()

        #expect(harness.appMode.mode == .synced)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.foodRepository.favorites().isEmpty)
        #expect(harness.foodRepository.searchLocal("Local").isEmpty)
        #expect(harness.entryRepository.entries(date: "2026-06-01").isEmpty)
        #expect(harness.weightRepository.entries().isEmpty)
        #expect(harness.supplementRepository.supplements().isEmpty)
        #expect(harness.goalsRepository.goals() == nil)
        #expect(harness.preferencesRepository.preferences() == nil)
        #expect(harness.recordedRequests.isEmpty)
    }
}
