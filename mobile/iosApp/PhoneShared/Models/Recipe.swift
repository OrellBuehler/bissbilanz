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
    // Grams of the finished dish (optional) — lets an entry be logged by
    // weight instead of by serving count.
    let cookedWeight: Double?
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

    /// Grams per serving implied by `cookedWeight` — lets a recipe be logged by
    /// weight instead of by serving count. `servings = grams / servingSize`.
    var cookedWeightServingSize: Double? {
        guard let cookedWeight, cookedWeight > 0, totalServings > 0 else { return nil }
        return cookedWeight / totalServings
    }

    /// Calories per 100 g of the finished dish, or nil without a cooked weight.
    var caloriesPerHundredGrams: Double? {
        guard let cookedWeight, cookedWeight > 0, let calories else { return nil }
        return (calories / cookedWeight) * 100
    }
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
    var cookedWeight: Double? = nil
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
    var cookedWeight: Double??
}

/// Declared in an extension so the memberwise initializer survives — see
/// `EntryUpdate`'s equivalent note in `Entry.swift`. `cookedWeight` is the only
/// field that can be explicitly cleared, so it alone needs the double-optional
/// (`decodeNullable`/`encodeNullable`) treatment.
extension RecipeUpdate {
    private enum CodingKeys: String, CodingKey {
        case name, totalServings, ingredients, isFavorite, imageUrl, cookedWeight
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        totalServings = try container.decodeIfPresent(Double.self, forKey: .totalServings)
        ingredients = try container.decodeIfPresent([RecipeIngredientInput].self, forKey: .ingredients)
        isFavorite = try container.decodeIfPresent(Bool.self, forKey: .isFavorite)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        cookedWeight = try container.decodeNullable(Double.self, forKey: .cookedWeight)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(totalServings, forKey: .totalServings)
        try container.encodeIfPresent(ingredients, forKey: .ingredients)
        try container.encodeIfPresent(isFavorite, forKey: .isFavorite)
        try container.encodeIfPresent(imageUrl, forKey: .imageUrl)
        try container.encodeNullable(cookedWeight, forKey: .cookedWeight)
    }
}

struct RecipesResponse: Codable {
    let recipes: [Recipe]
}

struct RecipeResponse: Codable {
    let recipe: Recipe
}
