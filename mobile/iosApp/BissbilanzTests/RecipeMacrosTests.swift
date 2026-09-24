@testable import Bissbilanz
import Foundation
import Testing

/// Mirrors `mobile/shared/.../util/RecipeMacrosTest.kt` — same golden cases,
/// applied to `RecipeRepository.recipeMacros`'s whole-recipe aggregation.
@Suite("RecipeRepository.recipeMacros unit conversion")
@MainActor
struct RecipeMacrosTests {
    private func makeFood(id: String, servingSize: Double, servingUnit: String, calories: Double) throws -> Food {
        try JSONPatch.decode(Food.self, from: [
            "id": id,
            "userId": "u1",
            "name": "Food \(id)",
            "servingSize": servingSize,
            "servingUnit": servingUnit,
            "calories": calories,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "fiber": 0,
            "isFavorite": false,
        ])
    }

    private func makeIngredient(
        foodId: String,
        quantity: Double,
        servingUnit: String,
        food: Food
    ) throws -> RecipeIngredient {
        try JSONPatch.decode(RecipeIngredient.self, from: [
            "foodId": foodId,
            "quantity": quantity,
            "servingUnit": servingUnit,
            "sortOrder": 0,
            "food": try JSONPatch.dictionary(of: food),
        ])
    }

    @Test("Converts a volume-unit ingredient into the food's own unit")
    func convertsVolumeUnitIntoFoodsOwnUnit() throws {
        // 100 ml of oil = 200 kcal, so 2 tbsp (30 ml) = 60 kcal.
        let oil = try makeFood(id: "oil", servingSize: 100, servingUnit: "ml", calories: 200)
        let ingredients = [try makeIngredient(foodId: "oil", quantity: 2, servingUnit: "tbsp", food: oil)]

        let macros = RecipeRepository.recipeMacros(of: ingredients)

        #expect(abs(macros.calories - 60) < 1e-9)
    }

    @Test("Same unit is unaffected")
    func sameUnitIsUnaffected() throws {
        let oats = try makeFood(id: "oats", servingSize: 100, servingUnit: "g", calories: 380)
        let ingredients = [try makeIngredient(foodId: "oats", quantity: 50, servingUnit: "g", food: oats)]

        let macros = RecipeRepository.recipeMacros(of: ingredients)

        #expect(abs(macros.calories - 190) < 1e-9)
    }

    @Test("Legacy cross-dimension row falls back to the raw quantity")
    func legacyCrossDimensionRowFallsBackToRawQuantity() throws {
        let flour = try makeFood(id: "flour", servingSize: 100, servingUnit: "g", calories: 364)
        // 50 "ml" against a food measured in g — cannot happen for new input
        // (rejected server-side), but a pre-existing row must keep its numbers.
        let ingredients = [try makeIngredient(foodId: "flour", quantity: 50, servingUnit: "ml", food: flour)]

        let macros = RecipeRepository.recipeMacros(of: ingredients)

        #expect(abs(macros.calories - 182) < 1e-9)
    }
}
