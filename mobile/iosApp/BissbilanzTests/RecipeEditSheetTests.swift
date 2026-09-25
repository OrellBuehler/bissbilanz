@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// Covers the "editing a synced recipe wipes its ingredients" bug: the server's
/// recipe response never embeds `food` on an ingredient, and the old
/// `RecipeEditSheet.prefill()` dropped any ingredient whose `food` was nil —
/// which was *every* ingredient of a recipe fetched from the server.
@Suite("RecipeEditSheet ingredient resolution")
@MainActor
struct RecipeEditSheetTests {
    @Test("Resolves a server-shaped ingredient's food from the local cache")
    func resolvesFromLocalCache() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Oats")))
        let recipe = try harness.recipe(id: "r1", name: "Bowl", ingredientFoodId: "f1")

        let rows = await RecipeEditSheet.resolvedIngredientRows(for: recipe, foodRepository: harness.foodRepository)

        #expect(rows.count == 1)
        #expect(rows.first?.foodId == "f1")
        #expect(rows.first?.food?.name == "Oats")
    }

    @Test("Resolves a server-shaped ingredient's food from the API when not cached")
    func resolvesFromAPI() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/f1", json: """
        {"food": {
            "id": "f1", "userId": "u1", "name": "Rice", "servingSize": 100, "servingUnit": "g",
            "calories": 130, "protein": 3, "carbs": 28, "fat": 0, "fiber": 1, "isFavorite": false
        }}
        """)
        let recipe = try harness.recipe(id: "r1", name: "Bowl", ingredientFoodId: "f1")

        let rows = await RecipeEditSheet.resolvedIngredientRows(for: recipe, foodRepository: harness.foodRepository)

        #expect(rows.count == 1)
        #expect(rows.first?.food?.name == "Rice")
    }

    @Test("Keeps an ingredient whose food can't be resolved at all, instead of dropping it")
    func neverDropsAnUnresolvableIngredient() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/missing", status: 404, json: #"{"error": "not found"}"#)
        let recipe = try harness.recipe(id: "r1", name: "Bowl", ingredientFoodId: "missing")

        let rows = await RecipeEditSheet.resolvedIngredientRows(for: recipe, foodRepository: harness.foodRepository)

        #expect(rows.count == 1)
        #expect(rows.first?.foodId == "missing")
        #expect(rows.first?.food == nil)
    }
}
