package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Ranks recipes by how well a scaled portion fills the remaining calorie/macro
 * budget of the day. Favorites get a small score bonus and win exact ties.
 * Mirrors `src/lib/analytics/recipe-suggestions.ts`; locked by the golden vectors.
 */
data class MacroBudget(
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
)

data class SuggestionMacros(
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

data class SuggestionCandidate(
    val id: String,
    val name: String,
    val perServing: SuggestionMacros,
    val isFavorite: Boolean,
)

data class RecipeSuggestion(
    val id: String,
    val servings: Double,
    val macros: SuggestionMacros,
    val score: Double,
    val fit: Int,
)

const val MIN_REMAINING_CALORIES = 100.0
const val DEFAULT_SUGGESTION_LIMIT = 10

// Closest to one serving first, so equal scores keep the more natural portion.
private val SERVING_STEPS = listOf(1.0, 0.75, 1.25, 0.5, 1.5, 1.75, 2.0)
private const val MAX_CALORIE_OVERSHOOT = 0.3
private const val CALORIE_OVERSHOOT_WEIGHT = 1.5
private const val PROTEIN_UNDERSHOOT_WEIGHT = 1.5
private const val PROTEIN_FLOOR = 15.0
private const val CARBS_FLOOR = 15.0
private const val FAT_FLOOR = 10.0
private const val WEIGHT_CALORIES = 0.5
private const val WEIGHT_PROTEIN = 0.25
private const val WEIGHT_CARBS = 0.125
private const val WEIGHT_FAT = 0.125
private const val PORTION_PENALTY = 0.02
private const val FAVORITE_BONUS = 0.95

private fun macroError(
    amount: Double,
    remaining: Double,
    floor: Double,
): Double {
    val target = max(remaining, 0.0)
    return min(2.0, max(-1.0, (amount - target) / max(target, floor)))
}

private fun scoreServing(
    perServing: SuggestionMacros,
    servings: Double,
    remaining: MacroBudget,
): Double {
    val calErr = (perServing.calories * servings - remaining.calories) / remaining.calories
    val calPenalty = if (calErr > 0) CALORIE_OVERSHOOT_WEIGHT * calErr * calErr else calErr * calErr

    val proteinErr = macroError(perServing.protein * servings, remaining.protein, PROTEIN_FLOOR)
    val proteinPenalty =
        if (proteinErr < 0) PROTEIN_UNDERSHOOT_WEIGHT * proteinErr * proteinErr else proteinErr * proteinErr
    val carbsErr = macroError(perServing.carbs * servings, remaining.carbs, CARBS_FLOOR)
    val fatErr = macroError(perServing.fat * servings, remaining.fat, FAT_FLOOR)

    return WEIGHT_CALORIES * calPenalty +
        WEIGHT_PROTEIN * proteinPenalty +
        WEIGHT_CARBS * carbsErr * carbsErr +
        WEIGHT_FAT * fatErr * fatErr +
        PORTION_PENALTY * abs(servings - 1)
}

private class RankedSuggestion(
    val suggestion: RecipeSuggestion,
    val name: String,
    val isFavorite: Boolean,
)

fun suggestRecipes(
    remaining: MacroBudget,
    candidates: List<SuggestionCandidate>,
    limit: Int = DEFAULT_SUGGESTION_LIMIT,
): List<RecipeSuggestion> {
    if (remaining.calories < MIN_REMAINING_CALORIES) return emptyList()

    val ranked = mutableListOf<RankedSuggestion>()
    for (candidate in candidates) {
        val perServing = candidate.perServing
        if (!(perServing.calories > 0)) continue

        var bestServings = SERVING_STEPS[0]
        var bestScore = Double.POSITIVE_INFINITY
        for (servings in SERVING_STEPS) {
            val score = scoreServing(perServing, servings, remaining)
            if (score < bestScore) {
                bestScore = score
                bestServings = servings
            }
        }

        val calories = perServing.calories * bestServings
        if (calories > remaining.calories * (1 + MAX_CALORIE_OVERSHOOT)) continue

        val score = if (candidate.isFavorite) bestScore * FAVORITE_BONUS else bestScore
        ranked +=
            RankedSuggestion(
                suggestion =
                    RecipeSuggestion(
                        id = candidate.id,
                        servings = bestServings,
                        macros =
                            SuggestionMacros(
                                calories = calories,
                                protein = perServing.protein * bestServings,
                                carbs = perServing.carbs * bestServings,
                                fat = perServing.fat * bestServings,
                                fiber = perServing.fiber * bestServings,
                            ),
                        score = score,
                        fit = floor(100 * max(0.0, 1 - sqrt(score)) + 0.5).toInt(),
                    ),
                name = candidate.name,
                isFavorite = candidate.isFavorite,
            )
    }

    return ranked
        .sortedWith(
            compareBy<RankedSuggestion> { it.suggestion.score }
                .thenByDescending { it.isFavorite }
                .thenBy { it.name }
                .thenBy { it.suggestion.id },
        ).take(max(0, limit))
        .map { it.suggestion }
}

/** Recipe list/detail APIs return whole-recipe totals; suggestions work per serving. */
fun perServingMacros(
    totalServings: Double,
    calories: Double,
    protein: Double,
    carbs: Double,
    fat: Double,
    fiber: Double,
): SuggestionMacros {
    val divisor = if (totalServings > 0) totalServings else 1.0
    return SuggestionMacros(
        calories = calories / divisor,
        protein = protein / divisor,
        carbs = carbs / divisor,
        fat = fat / divisor,
        fiber = fiber / divisor,
    )
}
