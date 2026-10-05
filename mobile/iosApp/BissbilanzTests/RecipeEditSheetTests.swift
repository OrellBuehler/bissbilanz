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

    @Test("Scaled rows keep food and unit and round the quantity")
    func scaledRowsScaleTheSourceIngredients() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Oats")))
        let source = try harness.recipe(id: "r1", name: "Curry", ingredientFoodId: "f1")
        let ingredients = try #require(source.ingredients)

        let rows = await RecipeEditSheet.scaledIngredientRows(
            from: ingredients,
            factor: 1.0 / 3.0,
            foodRepository: harness.foodRepository
        )

        #expect(rows.count == 1)
        #expect(rows.first?.foodId == "f1")
        #expect(rows.first?.food?.name == "Oats")
        #expect(rows.first?.quantity == "33.33")
        #expect(rows.first?.unit == .g)
    }

    @Test("Source ingredients come from the cached detail without a request")
    func sourceIngredientsUseTheCache() async throws {
        let harness = try RepositoryHarness()
        let source = try harness.recipe(id: "r1", name: "Curry", ingredientFoodId: "f1")
        harness.context.insert(LocalRecipe(recipe: source))

        let ingredients = try await RecipeAmountStep.sourceIngredients(
            of: source,
            recipeRepository: harness.recipeRepository,
            appMode: harness.appMode
        )

        #expect(ingredients.map(\.foodId) == ["f1"])
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Source ingredients refresh the recipe detail when the cache has none")
    func sourceIngredientsRefreshWhenMissing() async throws {
        let harness = try RepositoryHarness()
        let summary = try harness.recipe(id: "r1", name: "Curry")
        harness.context.insert(LocalRecipe(recipe: summary))
        harness.stub("GET", "/api/recipes/r1", json: """
        {"recipe": {
            "id": "r1", "userId": "u1", "name": "Curry", "totalServings": 2, "isFavorite": false,
            "ingredients": [
                {"recipeId": "r1", "foodId": "f2", "quantity": 200, "servingUnit": "g", "sortOrder": 1},
                {"recipeId": "r1", "foodId": "f1", "quantity": 1, "servingUnit": "tbsp", "sortOrder": 0}
            ]
        }}
        """)

        let ingredients = try await RecipeAmountStep.sourceIngredients(
            of: summary,
            recipeRepository: harness.recipeRepository,
            appMode: harness.appMode
        )

        #expect(ingredients.map(\.foodId) == ["f1", "f2"])
    }

    @Test("A failed detail refresh surfaces instead of looking like an empty recipe")
    func sourceIngredientsSurfaceRefreshErrors() async throws {
        let harness = try RepositoryHarness()
        let summary = try harness.recipe(id: "r1", name: "Curry")
        harness.context.insert(LocalRecipe(recipe: summary))
        harness.stubError("GET", "/api/recipes/r1", code: .notConnectedToInternet)

        var thrown: Error?
        do {
            _ = try await RecipeAmountStep.sourceIngredients(
                of: summary,
                recipeRepository: harness.recipeRepository,
                appMode: harness.appMode
            )
        } catch {
            thrown = error
        }

        #expect(thrown != nil)
        #expect(!(thrown is RecipeSourceError))
    }

    @Test("A recipe with no ingredients anywhere is reported as such")
    func sourceIngredientsWithNothingAvailable() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let summary = try harness.recipe(id: "r1", name: "Curry")
        harness.context.insert(LocalRecipe(recipe: summary))

        var thrown: Error?
        do {
            _ = try await RecipeAmountStep.sourceIngredients(
                of: summary,
                recipeRepository: harness.recipeRepository,
                appMode: harness.appMode
            )
        } catch {
            thrown = error
        }

        #expect(thrown is RecipeSourceError)
    }
}
