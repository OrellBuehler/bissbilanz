package com.bissbilanz.android.health

import androidx.health.connect.client.units.Mass
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry

/** Unit an extended nutrient is written to Health Connect's `NutritionRecord` in. */
enum class HealthNutrientUnit {
    GRAM,
    MILLIGRAM,
    MICROGRAM,
}

/**
 * One extended nutrient the app can write to Health Connect as part of the daily
 * nutrition totals, mirroring iOS's `HealthNutrient` catalog. Each is individually
 * opt-in and off by default — the five core macros (energy/protein/carbs/fat/fiber)
 * stay under the coarser [HealthSyncPreferences.writeNutrition] toggle, unchanged.
 */
data class HealthNutrient(
    val key: String,
    val unit: HealthNutrientUnit,
    val amount: (Food) -> Double?,
)

/**
 * Extended nutrients grouped the way the rest of the app groups them (see
 * `nutrientCategories()` in `SettingsScreen.kt`), filtered to the keys Health
 * Connect's `NutritionRecord` actually has a field for. `water` has no
 * `NutritionRecord` counterpart — Health Connect models water intake as a separate
 * `HydrationRecord` — and is deliberately absent, the same way iOS omits nutrients
 * HealthKit has no dietary type for.
 */
val EXTENDED_HEALTH_NUTRIENT_CATEGORIES: List<Pair<String, List<HealthNutrient>>> =
    listOf(
        "fat_breakdown" to
            listOf(
                HealthNutrient("saturatedFat", HealthNutrientUnit.GRAM) { it.saturatedFat },
                HealthNutrient("monounsaturatedFat", HealthNutrientUnit.GRAM) { it.monounsaturatedFat },
                HealthNutrient("polyunsaturatedFat", HealthNutrientUnit.GRAM) { it.polyunsaturatedFat },
                HealthNutrient("cholesterol", HealthNutrientUnit.MILLIGRAM) { it.cholesterol },
            ),
        "sugar_carb" to
            listOf(
                HealthNutrient("sugar", HealthNutrientUnit.GRAM) { it.sugar },
            ),
        "mineral" to
            listOf(
                HealthNutrient("sodium", HealthNutrientUnit.MILLIGRAM) { it.sodium },
                HealthNutrient("potassium", HealthNutrientUnit.MILLIGRAM) { it.potassium },
                HealthNutrient("calcium", HealthNutrientUnit.MILLIGRAM) { it.calcium },
                HealthNutrient("iron", HealthNutrientUnit.MILLIGRAM) { it.iron },
                HealthNutrient("magnesium", HealthNutrientUnit.MILLIGRAM) { it.magnesium },
                HealthNutrient("phosphorus", HealthNutrientUnit.MILLIGRAM) { it.phosphorus },
                HealthNutrient("zinc", HealthNutrientUnit.MILLIGRAM) { it.zinc },
                HealthNutrient("copper", HealthNutrientUnit.MILLIGRAM) { it.copper },
                HealthNutrient("manganese", HealthNutrientUnit.MILLIGRAM) { it.manganese },
                HealthNutrient("selenium", HealthNutrientUnit.MICROGRAM) { it.selenium },
                HealthNutrient("iodine", HealthNutrientUnit.MICROGRAM) { it.iodine },
                HealthNutrient("chromium", HealthNutrientUnit.MICROGRAM) { it.chromium },
                HealthNutrient("molybdenum", HealthNutrientUnit.MICROGRAM) { it.molybdenum },
                HealthNutrient("chloride", HealthNutrientUnit.MILLIGRAM) { it.chloride },
            ),
        "vitamin" to
            listOf(
                HealthNutrient("vitaminA", HealthNutrientUnit.MICROGRAM) { it.vitaminA },
                HealthNutrient("vitaminB1", HealthNutrientUnit.MILLIGRAM) { it.vitaminB1 },
                HealthNutrient("vitaminB2", HealthNutrientUnit.MILLIGRAM) { it.vitaminB2 },
                HealthNutrient("vitaminB3", HealthNutrientUnit.MILLIGRAM) { it.vitaminB3 },
                HealthNutrient("vitaminB5", HealthNutrientUnit.MILLIGRAM) { it.vitaminB5 },
                HealthNutrient("vitaminB6", HealthNutrientUnit.MILLIGRAM) { it.vitaminB6 },
                HealthNutrient("vitaminB7", HealthNutrientUnit.MICROGRAM) { it.vitaminB7 },
                HealthNutrient("vitaminB9", HealthNutrientUnit.MICROGRAM) { it.vitaminB9 },
                HealthNutrient("vitaminB12", HealthNutrientUnit.MICROGRAM) { it.vitaminB12 },
                HealthNutrient("vitaminC", HealthNutrientUnit.MILLIGRAM) { it.vitaminC },
                HealthNutrient("vitaminD", HealthNutrientUnit.MICROGRAM) { it.vitaminD },
                HealthNutrient("vitaminE", HealthNutrientUnit.MILLIGRAM) { it.vitaminE },
                HealthNutrient("vitaminK", HealthNutrientUnit.MICROGRAM) { it.vitaminK },
            ),
        "other" to
            listOf(
                HealthNutrient("caffeine", HealthNutrientUnit.MILLIGRAM) { it.caffeine },
            ),
    )

val EXTENDED_HEALTH_NUTRIENTS: List<HealthNutrient> = EXTENDED_HEALTH_NUTRIENT_CATEGORIES.flatMap { it.second }

private val EXTENDED_HEALTH_NUTRIENT_BY_KEY: Map<String, HealthNutrient> = EXTENDED_HEALTH_NUTRIENTS.associateBy { it.key }

/** Looks up an already-resolved total by nutrient key and converts it to the unit that key's `NutritionRecord` field expects. */
internal fun Map<String, Double>.massOf(key: String): Mass? {
    val value = this[key] ?: return null
    return when (EXTENDED_HEALTH_NUTRIENT_BY_KEY[key]?.unit ?: return null) {
        HealthNutrientUnit.GRAM -> Mass.grams(value)
        HealthNutrientUnit.MILLIGRAM -> Mass.milligrams(value)
        HealthNutrientUnit.MICROGRAM -> Mass.micrograms(value)
    }
}

/**
 * Day totals per extended nutrient key, resolved the way iOS resolves them: only
 * food-backed entries carry the full nutrient data, so recipe and quick-log entries
 * contribute nothing beyond the five core macros (see `HealthKitService.nutrientTotals`).
 */
fun extendedNutrientTotals(
    entries: List<Entry>,
    enabledKeys: Set<String>,
): Map<String, Double> {
    if (enabledKeys.isEmpty()) return emptyMap()
    val nutrients = EXTENDED_HEALTH_NUTRIENTS.filter { it.key in enabledKeys }
    if (nutrients.isEmpty()) return emptyMap()
    val totals = mutableMapOf<String, Double>()
    for (entry in entries) {
        val food = entry.food ?: continue
        for (nutrient in nutrients) {
            val perServing = nutrient.amount(food) ?: continue
            if (perServing <= 0) continue
            totals[nutrient.key] = (totals[nutrient.key] ?: 0.0) + perServing * entry.servings
        }
    }
    return totals
}
