package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient

/**
 * Replicates the server's per-serving recipe macro computation
 * (`buildRecipeMacrosCte` in `src/lib/server/recipe-macros.ts`):
 *
 *     SUM(food.macro * convertedQuantity / food.servingSize) / recipe.totalServings
 *
 * where the ingredient's quantity is converted into the food's own unit first (same
 * dimension only — see `convertQuantityForMacros`), so values computed locally (Local
 * mode, optimistic temp records) agree with what the server reports for the same
 * recipe after migration/upload.
 *
 * Returns null when the macros cannot be computed faithfully — no ingredients, a
 * non-positive divisor, or a referenced food that cannot be resolved (e.g. not cached
 * locally in Synced mode). Callers keep their previous values in that case rather than
 * under-counting.
 */
fun computeRecipePerServingMacros(
    ingredients: List<RecipeIngredient>,
    totalServings: Double,
    resolveFood: (String) -> Food?,
): MacroSummary? {
    if (ingredients.isEmpty() || totalServings <= 0.0) return null
    var calories = 0.0
    var protein = 0.0
    var carbs = 0.0
    var fat = 0.0
    var fiber = 0.0
    for (ingredient in ingredients) {
        val food = resolveFood(ingredient.foodId) ?: return null
        if (food.servingSize <= 0.0) return null
        val convertedQuantity =
            convertQuantityForMacros(ingredient.quantity, ingredient.servingUnit.value, food.servingUnit.value)
        val factor = convertedQuantity / food.servingSize
        calories += food.calories * factor
        protein += food.protein * factor
        carbs += food.carbs * factor
        fat += food.fat * factor
        fiber += food.fiber * factor
    }
    return MacroSummary(
        calories = calories / totalServings,
        protein = protein / totalServings,
        carbs = carbs / totalServings,
        fat = fat / totalServings,
        fiber = fiber / totalServings,
    )
}

/**
 * The recipe list/detail/create/update endpoints report whole-recipe totals, while
 * the local cache (and everything reading it, e.g. `Entry.resolvedCalories()`) holds
 * per-serving values — the same shape [computeRecipePerServingMacros] and the
 * entry-embedded recipe from `buildRecipeMacrosCte` produce. Apply this to every
 * server recipe before it is cached.
 */
fun RecipeDetail.serverTotalsToPerServing(): RecipeDetail {
    val divisor = if (totalServings > 0.0) totalServings else 1.0
    return copy(
        calories = calories / divisor,
        protein = protein / divisor,
        carbs = carbs / divisor,
        fat = fat / divisor,
        fiber = fiber / divisor,
    )
}

/**
 * Grams per serving implied by a recipe's cooked weight — for offering "log by
 * grams eaten" as an alternative to servings. `servings = grams / servingSize`.
 * Returns null when there is no cooked weight (or [totalServings] is invalid),
 * matching the web's `cookedWeightServingSize` in `src/lib/utils/recipe-yield.ts`.
 */
fun cookedWeightServingSize(
    cookedWeight: Double?,
    totalServings: Double,
): Double? {
    if (cookedWeight == null || cookedWeight <= 0.0) return null
    if (totalServings <= 0.0) return null
    return cookedWeight / totalServings
}

/** Servings implied by a target weight in grams — the inverse of [cookedWeightServingSize]. */
fun gramsToServings(
    grams: Double,
    cookedWeight: Double?,
    totalServings: Double,
): Double? {
    val servingSize = cookedWeightServingSize(cookedWeight, totalServings) ?: return null
    if (grams <= 0.0) return null
    return grams / servingSize
}

/** Calories per 100 g of the finished dish, given already per-serving calories. */
fun caloriesPerHundredGrams(
    perServingCalories: Double,
    cookedWeight: Double?,
    totalServings: Double,
): Double? {
    val servingSize = cookedWeightServingSize(cookedWeight, totalServings) ?: return null
    return (perServingCalories / servingSize) * 100.0
}
