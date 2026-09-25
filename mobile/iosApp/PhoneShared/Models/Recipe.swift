import Foundation

struct Recipe: Codable, Identifiable, Hashable {
    let id: String
    // Optional: the list endpoint (GET /api/recipes) returns summary items
    // WITHOUT userId, so a non-optional field would fail the whole list decode
    // and recipes would never pull. It is redundant client-side anyway.
    let userId: String?
    let name: String
    let totalServings: Double
    let isFavorite: Bool
    let imageUrl: String?
    let calories: Double?
    let protein: Double?
    let carbs: Double?
    let fat: Double?
    let fiber: Double?
    let createdAt: String?
    let updatedAt: String?
    let ingredients: [RecipeIngredient]?

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Recipe, rhs: Recipe) -> Bool {
        lhs.id == rhs.id
    }

    /// `calories`/`protein`/etc. are whole-recipe totals (matching the server and the
    /// list/detail endpoints) — divide by `totalServings` for a one-serving preview.
    /// Guards a non-positive `totalServings`, matching `EntryFactory.makeEntry`.
    var caloriesPerServing: Double? { calories.map { $0 / max(totalServings, 1) } }
    var proteinPerServing: Double? { protein.map { $0 / max(totalServings, 1) } }
    var carbsPerServing: Double? { carbs.map { $0 / max(totalServings, 1) } }
    var fatPerServing: Double? { fat.map { $0 / max(totalServings, 1) } }
    var fiberPerServing: Double? { fiber.map { $0 / max(totalServings, 1) } }
}

struct RecipeIngredient: Codable, Identifiable {
    let id: String?
    let recipeId: String?
    let foodId: String
    let quantity: Double
    let servingUnit: ServingUnit
    let sortOrder: Int
    let food: Food?
}

struct RecipeCreate: Codable {
    let name: String
    let totalServings: Double
    let ingredients: [RecipeIngredientInput]
    var isFavorite: Bool?
    var imageUrl: String?
}

struct RecipeIngredientInput: Codable {
    let foodId: String
    let quantity: Double
    let servingUnit: ServingUnit
}

struct RecipeUpdate: Codable {
    var name: String?
    var totalServings: Double?
    var ingredients: [RecipeIngredientInput]?
    var isFavorite: Bool?
    var imageUrl: String?
}

struct RecipesResponse: Codable {
    let recipes: [Recipe]
}

struct RecipeResponse: Codable {
    let recipe: Recipe
}
