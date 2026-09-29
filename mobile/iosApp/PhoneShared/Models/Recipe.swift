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
    var ingredients: [RecipeIngredient]?
    // Optional cooking instructions: the detail endpoint always sends `steps`
    // (empty when there are none), the list endpoint only `stepCount`. `var` with
    // a nil default keeps the memberwise initializer and decodes older cached
    // copies that have neither.
    var steps: [RecipeStep]? = nil
    var stepCount: Int? = nil

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

    /// True when every ingredient row is this food, so removing the food would
    /// leave the recipe without an ingredient.
    func hasOnlyIngredient(_ foodId: String) -> Bool {
        let ingredients = ingredients ?? []
        return !ingredients.isEmpty && ingredients.allSatisfy { $0.foodId == foodId }
    }

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

struct RecipeStep: Codable, Identifiable, Hashable {
    let id: String
    let sortOrder: Int
    let text: String
    let imageUrl: String?

    var input: RecipeStepInput {
        RecipeStepInput(text: text, imageUrl: imageUrl)
    }
}

/// One step as the server accepts it on POST/PATCH `/api/recipes` — `recipeStepSchema`
/// (`RecipeStepInput` in the spec). Order is the array order; a nil `imageUrl`
/// is omitted from the body, which the server reads as "no photo".
struct RecipeStepInput: Codable, Equatable {
    var text: String
    var imageUrl: String?
}

/// The server's caps (`MAX_RECIPE_STEPS`, `MAX_RECIPE_STEP_TEXT`).
enum RecipeStepLimits {
    static let maxSteps = 50
    static let maxTextLength = 2000
}

extension RecipeStepInput {
    /// What the server will accept from `inputs`: text trimmed, blank steps
    /// dropped, over-long text and lists cut to the caps. The server rejects the
    /// whole recipe on any violation, so every path that builds a steps list
    /// from stored rows goes through here.
    static func sanitized(_ inputs: [RecipeStepInput]) -> [RecipeStepInput] {
        let cleaned = inputs.compactMap { input -> RecipeStepInput? in
            let text = input.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return RecipeStepInput(text: String(text.prefix(RecipeStepLimits.maxTextLength)), imageUrl: input.imageUrl)
        }
        return Array(cleaned.prefix(RecipeStepLimits.maxSteps))
    }
}

extension Recipe {
    /// Steps in display order. Empty for a recipe without any, and while the
    /// steps have not been loaded (see `hasLoadedSteps`).
    var orderedSteps: [RecipeStep] {
        (steps ?? []).sorted { $0.sortOrder < $1.sortOrder }
    }

    /// False for a summary-shaped copy (the list endpoint, or a cache written
    /// by an older build) whose steps are unknown rather than absent.
    var hasLoadedSteps: Bool { steps != nil }
}

struct RecipeCreate: Codable {
    let name: String
    let totalServings: Double
    let ingredients: [RecipeIngredientInput]
    var isFavorite: Bool?
    var imageUrl: String?
    var cookedWeight: Double? = nil
    // Optional cooking steps; nil is omitted from the body (no steps).
    var steps: [RecipeStepInput]? = nil
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
    // Nil leaves the server's steps untouched; a list (even an empty one)
    // replaces all of them.
    var steps: [RecipeStepInput]?
}

/// Declared in an extension so the memberwise initializer survives — see
/// `EntryUpdate`'s equivalent note in `Entry.swift`. `cookedWeight` is the only
/// field that can be explicitly cleared, so it alone needs the double-optional
/// (`decodeNullable`/`encodeNullable`) treatment. `steps` is only encoded when set:
/// the server treats an omitted list as "unchanged" and a present one as a replace.
extension RecipeUpdate {
    private enum CodingKeys: String, CodingKey {
        case name, totalServings, ingredients, isFavorite, imageUrl, cookedWeight, steps
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        totalServings = try container.decodeIfPresent(Double.self, forKey: .totalServings)
        ingredients = try container.decodeIfPresent([RecipeIngredientInput].self, forKey: .ingredients)
        isFavorite = try container.decodeIfPresent(Bool.self, forKey: .isFavorite)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        cookedWeight = try container.decodeNullable(Double.self, forKey: .cookedWeight)
        steps = try container.decodeIfPresent([RecipeStepInput].self, forKey: .steps)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(totalServings, forKey: .totalServings)
        try container.encodeIfPresent(ingredients, forKey: .ingredients)
        try container.encodeIfPresent(isFavorite, forKey: .isFavorite)
        try container.encodeIfPresent(imageUrl, forKey: .imageUrl)
        try container.encodeNullable(cookedWeight, forKey: .cookedWeight)
        try container.encodeIfPresent(steps, forKey: .steps)
    }
}

struct RecipesResponse: Codable {
    let recipes: [Recipe]
}

struct RecipeResponse: Codable {
    let recipe: Recipe
}
