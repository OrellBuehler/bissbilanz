@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("App Intents")
@MainActor
struct IntentsTests {
    private func makeWriter(_ harness: RepositoryHarness) -> EntryWriter {
        EntryWriter(
            entryRepository: harness.entryRepository,
            foodRepository: harness.foodRepository,
            recipeRepository: harness.recipeRepository,
            syncManager: harness.syncManager
        )
    }

    private func seedFood(_ harness: RepositoryHarness, _ food: Food) throws {
        harness.context.insert(LocalFood(food: food))
        try harness.context.save()
    }

    private func date(hour: Int) -> Date {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 16
        components.hour = hour
        return Calendar.current.date(from: components)!
    }

    // MARK: - Meal defaulting

    @Test("forCurrentTime maps the hour of day to a meal")
    func mealForCurrentTime() {
        #expect(MealTypeAppEnum.forCurrentTime(date(hour: 8)) == .breakfast)
        #expect(MealTypeAppEnum.forCurrentTime(date(hour: 12)) == .lunch)
        #expect(MealTypeAppEnum.forCurrentTime(date(hour: 15)) == .snacks)
        #expect(MealTypeAppEnum.forCurrentTime(date(hour: 20)) == .dinner)
        #expect(MealTypeAppEnum.forCurrentTime(date(hour: 3)) == .dinner)
        #expect(MealTypeAppEnum.breakfast.serverValue == "breakfast")
    }

    // MARK: - Logging

    @Test("logFood writes the entry locally and queues the upload in Synced mode")
    func logFoodQueuesUpload() async throws {
        // online: false so the immediate drain is a no-op and the queued op
        // stays observable without stubbing the network.
        let harness = try RepositoryHarness(mode: .synced, online: false)
        try seedFood(harness, harness.food(id: "f1", name: "Banana"))
        let writer = makeWriter(harness)

        let entry = try await writer.logFood(id: "f1", meal: .breakfast, servings: 2, date: "2026-06-16")

        #expect(entry.foodId == "f1")
        #expect(entry.mealType == "breakfast")
        #expect(entry.servings == 2)
        #expect(harness.entryRepository.entries(date: "2026-06-16").map(\.id) == [entry.id])
        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        #expect(queued.first?.type == "create_entry")
        #expect(queued.first?.affectedId == entry.id)
    }

    @Test("logFood persists locally without queueing in Local mode")
    func logFoodLocalMode() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, harness.food(id: "f1", name: "Banana"))
        let writer = makeWriter(harness)

        let entry = try await writer.logFood(id: "f1", meal: .lunch, servings: 1, date: "2026-06-16")

        #expect(harness.entryRepository.entries(date: "2026-06-16").map(\.id) == [entry.id])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("logRecipe logs by recipeId")
    func logRecipe() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: "r1", name: "Bowl")))
        try harness.context.save()
        let writer = makeWriter(harness)

        let entry = try await writer.logRecipe(id: "r1", meal: .dinner, servings: 1, date: "2026-06-16")

        #expect(entry.recipeId == "r1")
        #expect(entry.mealType == "dinner")
        #expect(harness.entryRepository.entries(date: "2026-06-16").map(\.id) == [entry.id])
    }

    // MARK: - Resolution

    @Test("searchFoods falls back to favorites and recents for an empty query")
    func searchFoodsEmptyReturnsSuggestions() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, harness.food(id: "f1", name: "Apple", isFavorite: true))
        try seedFood(harness, harness.food(id: "f2", name: "Almonds", isFavorite: true))
        let writer = makeWriter(harness)

        let suggestions = await writer.searchFoods("   ")

        #expect(Set(suggestions.map(\.id)) == ["f1", "f2"])
    }

    @Test("searchFoods matches by name in Local mode")
    func searchFoodsMatchesByName() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, harness.food(id: "f1", name: "Brown Rice"))
        try seedFood(harness, harness.food(id: "f2", name: "Black Beans"))
        let writer = makeWriter(harness)

        let results = await writer.searchFoods("rice")

        #expect(results.map(\.id) == ["f1"])
    }

    @Test("FoodEntity carries the fields the system displays and indexes")
    func foodEntityMapping() {
        let food = harness_food(id: "f1", name: "Banana", calories: 105, brand: "Dole")
        let entity = FoodEntity(food: food)
        #expect(entity.id == "f1")
        #expect(entity.name == "Banana")
        #expect(entity.brand == "Dole")
        #expect(entity.calories == 105)
        #expect(entity.attributeSet.title == "Banana")
    }

    /// Standalone `Food` factory (no harness/store needed).
    private func harness_food(id: String, name: String, calories: Double, brand: String?) -> Food {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "servingSize": 100,
            "servingUnit": "g",
            "calories": calories,
            "protein": 1,
            "carbs": 27,
            "fat": 0,
            "fiber": 3,
            "isFavorite": false,
        ]
        if let brand { dict["brand"] = brand }
        return try! JSONPatch.decode(Food.self, from: dict)
    }
}
