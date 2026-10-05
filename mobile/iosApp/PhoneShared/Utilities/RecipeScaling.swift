import Foundation

enum RecipeScaleMode {
    case servings
    case grams
}

enum RecipeIngredientLimits {
    static let maxIngredients = 100
}

/// How much of a source recipe to copy, as a multiple of its ingredient quantities, or nil when
/// the amount or the divisor (`totalServings`, or `cookedWeight` in grams mode) is not positive.
func recipeScaleFactor(
    totalServings: Double,
    cookedWeight: Double?,
    amount: Double,
    mode: RecipeScaleMode
) -> Double? {
    guard amount > 0 else { return nil }
    let divisor: Double
    switch mode {
    case .servings:
        divisor = totalServings
    case .grams:
        guard let cookedWeight else { return nil }
        divisor = cookedWeight
    }
    guard divisor > 0 else { return nil }
    return amount / divisor
}

/// Scales every quantity by `factor`, rounded to two decimals and never below 0.01. Food and
/// unit are kept, order is preserved.
func scaleIngredients(_ ingredients: [RecipeIngredientInput], factor: Double) -> [RecipeIngredientInput] {
    ingredients.map { ingredient in
        let scaled = (ingredient.quantity * factor * 100).rounded(.toNearestOrAwayFromZero) / 100
        return RecipeIngredientInput(
            foodId: ingredient.foodId,
            quantity: max(0.01, scaled),
            servingUnit: ingredient.servingUnit
        )
    }
}
