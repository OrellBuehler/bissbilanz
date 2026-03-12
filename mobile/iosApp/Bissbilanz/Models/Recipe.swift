import Foundation

struct Recipe: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
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
