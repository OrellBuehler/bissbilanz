@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Repository tests")
@MainActor
struct RepositoryTests {
    // MARK: Entries

    @Test("Entry refresh replaces the cached day, keeping temp rows and other days")
    func entryRefreshReplacesByDate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        let tempId = LocalStore.makeTempId()
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "old-1", date: "2026-06-01"),
            date: "2026-06-01"
        ))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: tempId, date: "2026-06-01"),
            date: "2026-06-01"
        ))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "other-1", date: "2026-06-02"),
            date: "2026-06-02"
        ))
        try harness.context.save()

        harness.stub("GET", "/api/entries", json: """
        {"entries": [{
            "id": "new-1", "mealType": "breakfast", "servings": 2,
            "foodId": "f1", "foodName": "Oats",
            "calories": 150, "protein": 5, "carbs": 27, "fat": 2.5, "fiber": 4
        }]}
        """)

        try await repo.refresh(date: "2026-06-01")

        let day = repo.entries(date: "2026-06-01")
        #expect(Set(day.map(\.id)) == [tempId, "new-1"])
        #expect(repo.entries(date: "2026-06-02").map(\.id) == ["other-1"])
    }

    @Test("Entry create writes the temp row locally and queues the upload")
    func entryCreateWritesLocallyAndQueues() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository

        let create = EntryCreate(foodId: "f1", mealType: "lunch", servings: 1.5, date: "2026-06-01")
        let created = try await repo.createEntry(create, food: harness.food(id: "f1", name: "Rice"))

        #expect(LocalStore.isTempId(created.id))
        #expect(created.displayName == "Rice")
        #expect(repo.entries(date: "2026-06-01").map(\.id) == [created.id])
        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        #expect(queued.first?.type == "create_entry")
        #expect(queued.first?.affectedId == created.id)
        // The write itself never touches the network.
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Drained entry create replaces the temp row with the merged server record")
    func entryCreateDrainReplacesTempRow() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        harness.stub("POST", "/api/entries", json: """
        {"entry": {
            "id": "server-1", "userId": "u1", "date": "2026-06-01",
            "mealType": "lunch", "servings": 1.5, "foodId": "f1"
        }}
        """)

        let create = EntryCreate(foodId: "f1", mealType: "lunch", servings: 1.5, date: "2026-06-01")
        _ = try await repo.createEntry(create, food: harness.food(id: "f1", name: "Rice"))
        await harness.syncManager.drainPendingQueue()

        let day = repo.entries(date: "2026-06-01")
        #expect(day.map(\.id) == ["server-1"])
        // Raw POST responses lack resolved macros — merged from the optimistic row.
        #expect(day.first?.displayName == "Rice")
        #expect(day.first?.totalCalories == 150)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Entry create keeps the optimistic local row when the upload fails")
    func entryCreateKeepsLocalRowOnAPIFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        harness.stub("POST", "/api/entries", status: 500, json: #"{"error": "boom"}"#)

        let create = EntryCreate(foodId: "f1", mealType: "dinner", servings: 1, date: "2026-06-01")
        _ = try await repo.createEntry(create, food: harness.food(id: "f1", name: "Rice"))
        await harness.syncManager.drainPendingQueue()

        let day = repo.entries(date: "2026-06-01")
        #expect(day.count == 1)
        #expect(LocalStore.isTempId(day.first?.id ?? ""))
        #expect(day.first?.displayName == "Rice")
        // The op stays queued for a retry.
        #expect(harness.syncManager.queuedRows().count == 1)
        #expect(harness.syncManager.queuedRows().first?.retryCount == 1)
    }

    @Test("Entry delete removes the local row and cancels the queued create for temp ids")
    func entryDeleteCancelsQueuedCreateForTempIds() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository

        let create = EntryCreate(foodId: "f1", mealType: "lunch", servings: 1, date: "2026-06-01")
        let created = try await repo.createEntry(create)
        try await repo.deleteEntry(id: created.id)
        await harness.syncManager.drainPendingQueue()

        #expect(repo.entries(date: "2026-06-01").isEmpty)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Updating a temp entry rewrites the queued create payload")
    func entryUpdateCoalescesIntoQueuedCreate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository

        let create = EntryCreate(foodId: "f1", mealType: "lunch", servings: 1, date: "2026-06-01")
        let created = try await repo.createEntry(create)
        _ = try await repo.updateEntry(id: created.id, EntryUpdate(mealType: "dinner", servings: 3))

        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        guard case let .createEntry(body, localId)? = queued.first?.operation() else {
            Issue.record("expected a coalesced createEntry operation")
            return
        }
        #expect(localId == created.id)
        #expect(body.mealType == "dinner")
        #expect(body.servings == 3)
        #expect(repo.entries(date: "2026-06-01").first?.servings == 3)
    }

    @Test("Day properties write locally first and queue the upload")
    func dayPropertiesWriteLocallyAndQueue() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        harness.stub("POST", "/api/day-properties/2026-06-01", status: 500, json: #"{"error": "boom"}"#)

        try await repo.setDayProperties(date: "2026-06-01", isFastingDay: true)
        await harness.syncManager.drainPendingQueue()

        #expect(repo.isFastingDay(date: "2026-06-01") == true)
        #expect(harness.syncManager.queuedRows().count == 1)
    }

    @Test("Copy entries duplicates the day locally and queues one create per entry")
    func copyEntriesCopiesLocally() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "e1", date: "2026-06-01", foodId: "f1"),
            date: "2026-06-01"
        ))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "e2", date: "2026-06-01", mealType: "dinner"),
            date: "2026-06-01"
        ))
        try harness.context.save()

        let copied = try await repo.copyEntries(fromDate: "2026-06-01", toDate: "2026-06-02")

        #expect(copied == 2)
        let day = repo.entries(date: "2026-06-02")
        #expect(day.count == 2)
        #expect(day.allSatisfy { LocalStore.isTempId($0.id) })
        #expect(day.first?.totalCalories == 100) // display macros survive the copy
        #expect(harness.syncManager.queuedRows().count == 2)
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Copy entries falls back to the server copy when the local source day is empty")
    func copyEntriesFallsBackToServerCopy() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.entryRepository
        // Fresh install/upgrade: the local store has nothing for the source day.
        harness.stub("POST", "/api/entries/copy", json: """
        {"entries": [
            {"id": "c1", "mealType": "lunch", "servings": 1, "foodId": "f1",
             "foodName": "Rice", "calories": 130, "date": "2026-06-02"},
            {"id": "c2", "mealType": "dinner", "servings": 2, "quickName": "Soup",
             "quickCalories": 90, "date": "2026-06-02"}
        ]}
        """)

        let copied = try await repo.copyEntries(fromDate: "2026-06-01", toDate: "2026-06-02")

        #expect(copied == 2)
        #expect(harness.recordedRequests == ["POST /api/entries/copy"])
        let day = repo.entries(date: "2026-06-02")
        #expect(Set(day.map(\.id)) == ["c1", "c2"])
        // Server-side copies are already persisted — nothing queues.
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Copy entries stays local-only in Local mode even when the source day is empty")
    func copyEntriesLocalModeNeverCallsServer() async throws {
        let harness = try RepositoryHarness(mode: .local)

        let copied = try await harness.entryRepository.copyEntries(fromDate: "2026-06-01", toDate: "2026-06-02")

        #expect(copied == 0)
        #expect(harness.recordedRequests.isEmpty)
    }

    // MARK: Foods

    @Test("Drained food create replaces the temp id and remaps entry references")
    func foodCreateDrainReplacesTempIdAndRemaps() async throws {
        let harness = try RepositoryHarness()
        let foodRepo = harness.foodRepository
        let entryRepo = harness.entryRepository
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/entries", json: """
        {"entry": {"id": "e-server", "userId": "u1", "date": "2026-06-01", "mealType": "lunch", "servings": 1}}
        """)

        let create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        let temp = try await foodRepo.createFood(create)
        _ = try await entryRepo.createEntry(
            EntryCreate(foodId: temp.id, mealType: "lunch", servings: 1, date: "2026-06-01"),
            food: temp
        )
        await harness.syncManager.drainPendingQueue()

        #expect(foodRepo.food(id: "f-server")?.name == "Skyr")
        #expect(foodRepo.food(id: temp.id) == nil)
        // The entry row now points at the server food id.
        #expect(entryRepo.entries(date: "2026-06-01").first?.foodId == "f-server")
        #expect(harness.syncManager.queuedRows().isEmpty)

        // The POSTed bodies must carry the create payload and — for the
        // chained entry — the remapped server food id, not the temp id.
        let foodBody = try #require(harness.recordedBodies("POST", "/api/foods").first)
        let foodCreate = try JSONDecoder().decode(FoodCreate.self, from: foodBody)
        #expect(foodCreate.name == "Skyr")
        #expect(foodCreate.calories == 98)
        let entryBody = try #require(harness.recordedBodies("POST", "/api/entries").first)
        let entryCreate = try JSONDecoder().decode(EntryCreate.self, from: entryBody)
        #expect(entryCreate.foodId == "f-server")
    }

    @Test("Food create keeps the temp row when the upload fails")
    func foodCreateKeepsTempRowOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        harness.stub("POST", "/api/foods", status: 500, json: #"{"error": "boom"}"#)

        let create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        _ = try await repo.createFood(create)
        await harness.syncManager.drainPendingQueue()

        let local = repo.searchLocal("Skyr")
        #expect(local.count == 1)
        #expect(LocalStore.isTempId(local.first?.id ?? ""))
        #expect(harness.syncManager.queuedRows().count == 1)
    }

    @Test("Updating a temp food rewrites the queued create body")
    func foodUpdateCoalescesIntoQueuedCreate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository

        let create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        let temp = try await repo.createFood(create)
        let edited = FoodCreate(
            name: "Skyr Vanilla", servingSize: 150, servingUnit: .g,
            calories: 105, protein: 15, carbs: 9, fat: 0.2, fiber: 0
        )
        _ = try await repo.updateFood(id: temp.id, edited)

        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        guard case let .createFood(body, localId)? = queued.first?.operation() else {
            Issue.record("expected a coalesced createFood operation")
            return
        }
        #expect(localId == temp.id)
        #expect(body.name == "Skyr Vanilla")
        #expect(body.calories == 105)
        #expect(repo.food(id: temp.id)?.name == "Skyr Vanilla")
    }

    @Test("Editing a food merge-patches the local row, preserving extended nutrients")
    func foodUpdateMergePreservesExtendedNutrients() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        // A scanned food carrying extended nutrients and OFF metadata.
        let scanned = try JSONPatch.decode(Food.self, from: [
            "id": "f1", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false,
            "saturatedFat": 0.1, "sodium": 55, "vitaminB12": 0.7,
            "nutriScore": "a", "novaGroup": 1, "additives": ["en:e330"],
            "ingredientsText": "Milk, cultures", "imageUrl": "https://img.example/skyr.jpg",
        ])
        try harness.context.insert(LocalFood(food: scanned))
        try harness.context.save()

        // The edit form only carries the basic fields.
        _ = try await repo.updateFood(id: "f1", FoodCreate(
            name: "Skyr Natural", servingSize: 150, servingUnit: .g,
            calories: 99, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        ))

        let updated = try #require(repo.food(id: "f1"))
        #expect(updated.name == "Skyr Natural")
        #expect(updated.calories == 99)
        #expect(updated.saturatedFat == 0.1)
        #expect(updated.sodium == 55)
        #expect(updated.vitaminB12 == 0.7)
        #expect(updated.nutriScore == "a")
        #expect(updated.novaGroup == 1)
        #expect(updated.additives == ["en:e330"])
        #expect(updated.ingredientsText == "Milk, cultures")
        #expect(updated.imageUrl == "https://img.example/skyr.jpg")
    }

    @Test("Editing a temp food merges into the queued create instead of replacing it")
    func foodUpdateMergesIntoQueuedCreate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository

        var create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        create.saturatedFat = 0.1
        create.nutriScore = "a"
        create.ingredientsText = "Milk, cultures"
        let temp = try await repo.createFood(create)

        // Editing the name must not strip the scanned fields from the upload.
        _ = try await repo.updateFood(id: temp.id, FoodCreate(
            name: "Skyr Natural", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        ))

        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        guard case let .createFood(body, _)? = queued.first?.operation() else {
            Issue.record("expected a coalesced createFood operation")
            return
        }
        #expect(body.name == "Skyr Natural")
        #expect(body.saturatedFat == 0.1)
        #expect(body.nutriScore == "a")
        #expect(body.ingredientsText == "Milk, cultures")
        // The local row keeps them too.
        #expect(repo.food(id: temp.id)?.saturatedFat == 0.1)
        #expect(repo.food(id: temp.id)?.nutriScore == "a")
    }

    @Test("Toggle favorite flips the local row and queues; temp ids patch the queued create")
    func toggleFavoriteUpdatesLocalFirst() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Rice")))
        try harness.context.save()

        _ = try await repo.toggleFavorite(foodId: "f1", isFavorite: true)
        #expect(repo.food(id: "f1")?.isFavorite == true)
        #expect(repo.favorites().map(\.id) == ["f1"])
        #expect(harness.syncManager.queuedRows().last?.type == "toggle_favorite")

        let temp = try await repo.createFood(FoodCreate(
            name: "Oats", servingSize: 40, servingUnit: .g,
            calories: 150, protein: 5, carbs: 27, fat: 2.5, fiber: 4
        ))
        _ = try await repo.toggleFavorite(foodId: temp.id, isFavorite: true)
        let createRow = harness.syncManager.queuedOperations(table: "foods", affectedId: temp.id)
        #expect(createRow.count == 1)
        guard case let .createFood(body, _)? = createRow.first?.operation() else {
            Issue.record("expected the queued createFood to absorb the favorite flag")
            return
        }
        #expect(body.isFavorite == true)
    }

    @Test("Favorites refresh upserts foods and recipes and reconciles un-favorited rows")
    func refreshFavoritesReconciles() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Old Fav", isFavorite: true)))
        try harness.context.save()
        harness.stub("GET", "/api/favorites", json: """
        {
            "foods": [{
                "id": "f2", "userId": "u1", "name": "New Fav", "servingSize": 100, "servingUnit": "g",
                "calories": 50, "protein": 5, "carbs": 5, "fat": 1, "fiber": 1, "isFavorite": true
            }],
            "recipes": [{
                "id": "r1", "userId": "u1", "name": "Fav Recipe", "totalServings": 1, "isFavorite": true
            }]
        }
        """)

        try await repo.refreshFavorites()

        #expect(repo.favorites().map(\.id) == ["f2"])
        #expect(repo.food(id: "f1")?.isFavorite == false)
        #expect(harness.recipeRepository.favoriteRecipes().map(\.id) == ["r1"])
    }

    @Test("Barcode lookup answers from the local store before hitting the API")
    func findByBarcodePrefersLocal() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Bar", barcode: "123")))
        try harness.context.save()

        let found = try await repo.findByBarcode("123")

        #expect(found?.id == "f1")
        #expect(harness.recordedRequests.isEmpty)
    }

    // MARK: Recipes

    @Test("Recipe refresh upserts by id, drops server-deleted rows and keeps temp rows")
    func recipeRefreshUpserts() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        let tempId = LocalStore.makeTempId()
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: "r1", name: "Stale")))
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: tempId, name: "Pending")))
        try harness.context.save()
        harness.stub("GET", "/api/recipes", json: """
        {"recipes": [{
            "id": "r2", "userId": "u1", "name": "Fresh", "totalServings": 4,
            "isFavorite": false, "calories": 800, "protein": 40, "carbs": 90, "fat": 25, "fiber": 10
        }]}
        """)

        try await repo.refresh()

        let ids = Set(repo.recipes().map(\.id))
        #expect(ids == [tempId, "r2"])
        #expect(repo.recipe(id: "r2")?.calories == 800)
    }

    @Test("Drained recipe create replaces the temp id with the server record")
    func recipeCreateDrainReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.recipeRepository
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {
            "id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2,
            "isFavorite": false, "calories": 500, "protein": 30, "carbs": 60, "fat": 15, "fiber": 8
        }}
        """)

        let create = RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 80, servingUnit: .g)]
        )
        let temp = try await repo.createRecipe(create)
        #expect(LocalStore.isTempId(temp.id))
        await harness.syncManager.drainPendingQueue()

        #expect(repo.recipes().map(\.id) == ["r-server"])
        #expect(repo.recipe(id: "r-server")?.calories == 500)
    }

    @Test("Local mode recipes compute macros from the local ingredient foods")
    func localModeRecipeMacrosComputedLocally() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let recipeRepo = harness.recipeRepository
        let entryRepo = harness.entryRepository
        // 100 kcal / 10 P / 20 C / 5 F / 3 Fib per 100 g serving.
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Rice")))
        try harness.context.save()

        // 150 g of f1 → factor 1.5 → 150 kcal total, 2 servings.
        let recipe = try await recipeRepo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 150, servingUnit: .g)]
        ))

        #expect(recipe.calories == 150)
        #expect(recipe.protein == 15)
        #expect(recipe.carbs == 30)
        #expect(recipe.fat == 7.5)
        #expect(recipe.fiber == 4.5)

        // Logging the recipe contributes per-serving macros (total / servings).
        let entry = try await entryRepo.createEntry(
            EntryCreate(recipeId: recipe.id, mealType: "lunch", servings: 1, date: "2026-06-01"),
            recipe: recipe
        )
        #expect(entry.totalCalories == 75)
        let day = entryRepo.calendarDays(year: 2026, month: 6, calorieGoal: nil)
        #expect(day.first?.calories == 75)
    }

    @Test("Recipe ingredient edits apply to the local row and recompute macros")
    func recipeIngredientEditAppliesLocally() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.recipeRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Rice")))
        try harness.context.save()
        let recipe = try await repo.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 150, servingUnit: .g)]
        ))

        _ = try await repo.updateRecipe(id: recipe.id, RecipeUpdate(
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 300, servingUnit: .g)]
        ))

        let updated = try #require(repo.recipe(id: recipe.id))
        #expect(updated.ingredients?.count == 1)
        #expect(updated.ingredients?.first?.quantity == 300)
        #expect(updated.calories == 300)
        #expect(updated.protein == 30)
    }

    // MARK: Weight

    @Test("Weight refresh upserts by id and updates changed rows")
    func weightRefreshUpsertsById() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.weightRepository
        try harness.context.insert(LocalWeightEntry(entry: harness.weight(id: "w1", date: "2026-06-01", kg: 80)))
        try harness.context.save()
        harness.stub("GET", "/api/weight", json: """
        {"entries": [
            {"id": "w1", "userId": "u1", "weightKg": 81, "entryDate": "2026-06-01"},
            {"id": "w2", "userId": "u1", "weightKg": 80.4, "entryDate": "2026-06-02"}
        ]}
        """)

        try await repo.refresh()

        let entries = repo.entries()
        #expect(entries.map(\.id) == ["w2", "w1"]) // newest first
        #expect(entries.last?.weightKg == 81)
        #expect(repo.latest()?.id == "w2")
    }

    @Test("Weight pagination returns newest-first pages without overlap")
    func weightPaginationPages() throws {
        let harness = try RepositoryHarness()
        let repo = harness.weightRepository
        for day in 1 ... 7 {
            try harness.context.insert(LocalWeightEntry(entry: harness.weight(
                id: "w\(day)", date: String(format: "2026-06-%02d", day), kg: 80
            )))
        }
        try harness.context.save()

        #expect(repo.entries(offset: 0, limit: 3).map(\.id) == ["w7", "w6", "w5"])
        #expect(repo.entries(offset: 3, limit: 3).map(\.id) == ["w4", "w3", "w2"])
        // Last page is short; past the end is empty
        #expect(repo.entries(offset: 6, limit: 3).map(\.id) == ["w1"])
        #expect(repo.entries(offset: 7, limit: 3).isEmpty)
    }

    @Test("Drained weight create replaces the temp row with the server record")
    func weightCreateDrainReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.weightRepository
        harness.stub("POST", "/api/weight", json: """
        {"entry": {"id": "w-server", "userId": "u1", "weightKg": 74.2, "entryDate": "2026-06-01"}}
        """)

        let temp = try await repo.createEntry(WeightCreate(weightKg: 74.2, entryDate: "2026-06-01"))
        #expect(LocalStore.isTempId(temp.id))
        await harness.syncManager.drainPendingQueue()

        #expect(repo.entries().map(\.id) == ["w-server"])
    }

    @Test("Weight create keeps the temp row when the upload fails")
    func weightCreateKeepsTempRowOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.weightRepository
        harness.stub("POST", "/api/weight", status: 500, json: #"{"error": "boom"}"#)

        _ = try await repo.createEntry(WeightCreate(weightKg: 74.2, entryDate: "2026-06-01"))
        await harness.syncManager.drainPendingQueue()

        let entries = repo.entries()
        #expect(entries.count == 1)
        #expect(LocalStore.isTempId(entries.first?.id ?? ""))
        #expect(entries.first?.weightKg == 74.2)
    }

    // MARK: Supplements

    @Test("Supplement log writes the local row and queues; the row survives upload failure")
    func supplementLogKeepsLocalOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.supplementRepository
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(id: "s1", name: "Vitamin D")))
        try harness.context.save()
        harness.stub("POST", "/api/supplements/s1/log", status: 500, json: #"{"error": "boom"}"#)

        try await repo.logSupplement(id: "s1", date: "2026-06-01")
        await harness.syncManager.drainPendingQueue()

        #expect(repo.loggedSupplementIds(date: "2026-06-01") == ["s1"])
        #expect(repo.localChecklist(date: "2026-06-01").first?.taken == true)
        #expect(harness.syncManager.queuedRows().count == 1)
    }

    @Test("Deleting a temp supplement removes its queued create and queued logs")
    func deleteTempSupplementCancelsQueuedCreateAndLogs() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.supplementRepository

        let temp = try await repo.createSupplement(
            SupplementCreate(name: "Magnesium", scheduleType: .daily, ingredients: [])
        )
        try await repo.logSupplement(id: temp.id, date: "2026-06-01")
        #expect(harness.syncManager.queuedRows().count == 2)

        try await repo.deleteSupplement(id: temp.id)
        await harness.syncManager.drainPendingQueue()

        #expect(repo.supplements().isEmpty)
        #expect(repo.loggedSupplementIds(date: "2026-06-01").isEmpty)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Unlogging a temp supplement cancels the queued log instead of queueing an unlog")
    func unlogTempSupplementCancelsQueuedLog() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.supplementRepository

        let temp = try await repo.createSupplement(
            SupplementCreate(name: "Zinc", scheduleType: .daily, ingredients: [])
        )
        try await repo.logSupplement(id: temp.id, date: "2026-06-01")
        try await repo.unlogSupplement(id: temp.id, date: "2026-06-01")

        let types = harness.syncManager.queuedRows().map(\.type)
        #expect(types == ["create_supplement"])
        #expect(repo.loggedSupplementIds(date: "2026-06-01").isEmpty)
    }

    @Test("Checklist refresh replaces the cached logs for the day")
    func checklistRefreshReplacesLogsByDate() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.supplementRepository
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(id: "s1", name: "Vitamin D")))
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(
            id: "s2",
            name: "Omega-3",
            sortOrder: 1
        )))
        harness.context.insert(LocalSupplementLog(supplementId: "s1", date: "2026-06-01", takenAt: "old"))
        try harness.context.save()
        harness.stub("GET", "/api/supplements/2026-06-01/checklist", json: """
        {"checklist": [
            {
                "supplement": {"id": "s1", "userId": "u1", "name": "Vitamin D", "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []},
                "taken": false, "takenAt": null
            },
            {
                "supplement": {"id": "s2", "userId": "u1", "name": "Omega-3", "scheduleType": "daily", "isActive": true, "sortOrder": 1, "ingredients": []},
                "taken": true, "takenAt": "2026-06-01T08:00:00Z"
            }
        ]}
        """)

        let checklist = try await repo.refreshChecklist(date: "2026-06-01")

        #expect(checklist.count == 2)
        #expect(repo.loggedSupplementIds(date: "2026-06-01") == ["s2"])
    }

    @Test("Drained supplement create replaces the temp id with the server record")
    func supplementCreateDrainReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.supplementRepository
        harness.stub("POST", "/api/supplements", json: """
        {"supplement": {
            "id": "s-server", "userId": "u1", "name": "Magnesium",
            "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []
        }}
        """)

        let temp = try await repo.createSupplement(
            SupplementCreate(name: "Magnesium", scheduleType: .daily, ingredients: [])
        )
        #expect(LocalStore.isTempId(temp.id))
        await harness.syncManager.drainPendingQueue()

        #expect(repo.supplements().map(\.id) == ["s-server"])
    }

    @Test("Supplement ingredient edits apply to the local row in both modes")
    func supplementIngredientEditsApplyLocally() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.supplementRepository

        // The supplement editor sends inline backing foods, not food ids.
        let inline = SupplementIngredientInput(
            foodId: nil,
            food: SupplementBackingFoodInput(
                name: "Magnesium citrate", servingSize: 1, servingUnit: "g",
                calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
                ingredientsText: "300 mg"
            ),
            servings: 1,
            sortOrder: 0
        )
        let created = try await repo.createSupplement(
            SupplementCreate(name: "Magnesium", scheduleType: .daily, ingredients: [inline])
        )
        #expect(created.ingredients.map(\.food.name) == ["Magnesium citrate"])
        #expect(repo.supplements().first?.ingredients.map(\.food.name) == ["Magnesium citrate"])

        var replacement = inline
        replacement.food = SupplementBackingFoodInput(
            name: "Magnesium glycinate", servingSize: 1, servingUnit: "g",
            calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
            ingredientsText: "200 mg"
        )
        _ = try await repo.updateSupplement(id: created.id, SupplementUpdate(ingredients: [replacement]))

        let updated = try #require(repo.supplements().first)
        #expect(updated.ingredients.map(\.food.name) == ["Magnesium glycinate"])
        #expect(updated.ingredients.first?.food.ingredientsText == "200 mg")
    }

    // MARK: Goals

    @Test("Goals write locally first and survive an upload failure")
    func goalsKeepLocalOnAPIFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.goalsRepository
        harness.stub("POST", "/api/goals", status: 500, json: #"{"error": "boom"}"#)

        let goals = Goals(
            calorieGoal: 2100, proteinGoal: 155, carbGoal: 230,
            fatGoal: 68, fiberGoal: 32, sodiumGoal: nil, sugarGoal: nil
        )
        _ = try await repo.setGoals(goals)
        await harness.syncManager.drainPendingQueue()

        #expect(repo.goals()?.calorieGoal == 2100)
        #expect(repo.goals()?.proteinGoal == 155)
        #expect(harness.syncManager.queuedRows().count == 1)
    }

    @Test("Goals refresh caches the server value")
    func goalsRefreshCachesServerValue() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.goalsRepository
        harness.stub("GET", "/api/goals", json: """
        {"goals": {"calorieGoal": 1900, "proteinGoal": 140, "carbGoal": 200, "fatGoal": 60, "fiberGoal": 28}}
        """)

        try await repo.refresh()

        #expect(repo.goals()?.calorieGoal == 1900)
        #expect(repo.goals()?.fiberGoal == 28)
    }

    // MARK: Preferences

    @Test("Preferences update merges the partial update onto the cached value locally")
    func preferencesUpdateMergesLocally() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.preferencesRepository
        harness.context.insert(LocalPreferences(preferences: .defaults))
        try harness.context.save()
        harness.stub("PATCH", "/api/preferences", status: 500, json: #"{"error": "boom"}"#)

        var update = PreferencesUpdate()
        update.showWeightWidget = false
        update.visibleNutrients = ["sugar"]
        _ = try await repo.update(update)
        await harness.syncManager.drainPendingQueue()

        let merged = try #require(repo.preferences())
        #expect(merged.showWeightWidget == false)
        #expect(merged.visibleNutrients == ["sugar"])
        // Untouched fields keep their cached values.
        #expect(merged.showChartWidget == Preferences.defaults.showChartWidget)
        #expect(merged.startPage == Preferences.defaults.startPage)
    }

    // MARK: Local mode

    @Test("Local mode repositories never hit the network and never enqueue")
    func localModeNeverHitsNetwork() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let entryRepo = harness.entryRepository
        let foodRepo = harness.foodRepository
        let recipeRepo = harness.recipeRepository
        let weightRepo = harness.weightRepository
        let supplementRepo = harness.supplementRepository
        let goalsRepo = harness.goalsRepository
        let preferencesRepo = harness.preferencesRepository

        // Refreshes are no-ops.
        try await entryRepo.refresh(date: "2026-06-01")
        try await entryRepo.refreshDayProperties(date: "2026-06-01")
        try await foodRepo.refreshFavorites()
        try await foodRepo.refreshFood(id: "f1")
        _ = await foodRepo.refreshRecentFoods()
        try await recipeRepo.refresh()
        try await weightRepo.refresh()
        try await supplementRepo.refresh()
        _ = try await supplementRepo.refreshChecklist(date: "2026-06-01")
        _ = await supplementRepo.history(startDate: "2026-06-01", endDate: "2026-06-07")
        try await goalsRepo.refresh()
        try await preferencesRepo.refresh()

        // Reads stay local.
        _ = await foodRepo.searchFoods(query: "rice")
        _ = try await foodRepo.findByBarcode("123")

        // Writes are purely local — temp ids are permanent until migration.
        let food = try await foodRepo.createFood(FoodCreate(
            name: "Local Rice", servingSize: 100, servingUnit: .g,
            calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4
        ))
        _ = try await entryRepo.createEntry(
            EntryCreate(foodId: food.id, mealType: "lunch", servings: 1, date: "2026-06-01"),
            food: food
        )
        _ = try await weightRepo.createEntry(WeightCreate(weightKg: 74, entryDate: "2026-06-01"))
        let supplement = try await supplementRepo.createSupplement(
            SupplementCreate(name: "Vitamin D", scheduleType: .daily, ingredients: [])
        )
        try await supplementRepo.logSupplement(id: supplement.id, date: "2026-06-01")
        _ = try await goalsRepo.setGoals(.defaults)
        try await entryRepo.setDayProperties(date: "2026-06-01", isFastingDay: true)
        try await foodRepo.deleteFood(id: food.id)

        // Even an explicit drain uploads nothing in Local mode.
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 0)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests.isEmpty)
        #expect(LocalStore.isTempId(food.id))
        #expect(weightRepo.entries().count == 1)
        #expect(entryRepo.entries(date: "2026-06-01").count == 1)
    }
}
