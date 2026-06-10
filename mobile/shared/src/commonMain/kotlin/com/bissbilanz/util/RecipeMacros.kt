package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.RecipeIngredient

/**
 * Replicates the server's per-serving recipe macro computation
 * (`buildRecipeMacrosCte` in `src/lib/server/entries.ts`):
 *
 *     SUM(food.macro * ingredient.quantity / food.servingSize) / recipe.totalServings
 *
 * so values computed locally (Local mode, optimistic temp records) agree with what the
 * server reports for the same recipe after migration/upload.
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
        val factor = ingredient.quantity / food.servingSize
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
