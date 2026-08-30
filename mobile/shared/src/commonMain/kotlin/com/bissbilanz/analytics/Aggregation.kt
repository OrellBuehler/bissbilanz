package com.bissbilanz.analytics

import kotlinx.datetime.LocalDate

/*
 * On-device equivalent of the server's recipe-macro aggregation
 * (src/lib/server/analytics.ts). The server resolves per-entry and per-day
 * nutrient totals with SQL CTEs over Postgres; this reproduces the exact same
 * math in pure Kotlin over local rows so the mobile apps can build the inputs
 * the analytics functions expect without an API round-trip.
 *
 * Faithfulness to the SQL matters down to the NULL handling, because that is
 * what the golden-vector parity suite (analytics-parity/) locks against the TS
 * reference (src/lib/analytics/aggregation.ts). The rules being mirrored:
 *  - a / NULLIF(b, 0) -> null when b == 0 (see nullDiv);
 *  - SUM(...) ignores NULL terms and is NULL only when every term is NULL
 *    (see nullSum);
 *  - core macros COALESCE to 0 (always numeric); extended nutrients do not, so
 *    a day with no measured value for a nutrient stays null rather than 0.
 *
 * Each platform's data-loader maps its SQLDelight / SwiftData rows into these
 * plain AggEntry / AggFood / AggRecipe shapes — that mapping is the only
 * platform-specific part; everything below is shared.
 */

/** A food with its base (per-serving-size) nutrients; extended nutrients are nullable. */
data class AggFood(
    val id: String,
    val servingSize: Double,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val novaGroup: Int? = null,
    val omega3: Double? = null,
    val omega6: Double? = null,
    val sodium: Double? = null,
    val caffeine: Double? = null,
    val saturatedFat: Double? = null,
    val transFat: Double? = null,
    val vitaminC: Double? = null,
    val vitaminD: Double? = null,
    val vitaminE: Double? = null,
    val alcohol: Double? = null,
    val addedSugars: Double? = null,
)

/** One ingredient line of a recipe: a [foodId] taken in [quantity] of the food's serving unit. */
data class AggRecipeIngredient(
    val foodId: String,
    val quantity: Double,
)

/** A recipe and its ingredient lines; [totalServings] divides the summed ingredient nutrients. */
data class AggRecipe(
    val id: String,
    val totalServings: Double,
    val ingredients: List<AggRecipeIngredient>,
)

/**
 * A logged entry. Exactly one of [foodId] / [recipeId] is normally set; a
 * quick-add entry sets neither and carries its own `quick*` macros. [servings]
 * scales whichever source resolves.
 */
data class AggEntry(
    val date: String,
    val mealType: String,
    val servings: Double,
    val foodId: String? = null,
    val recipeId: String? = null,
    val eatenAt: String? = null,
    val foodName: String? = null,
    val quickName: String? = null,
    val quickCalories: Double? = null,
    val quickProtein: Double? = null,
    val quickCarbs: Double? = null,
    val quickFat: Double? = null,
    val quickFiber: Double? = null,
)

/** Per-day nutrient totals; core macros are always numeric, extended nutrients are null when unmeasured. */
data class DailyNutrientTotals(
    val date: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val omega3: Double?,
    val omega6: Double?,
    val sodium: Double?,
    val caffeine: Double?,
    val saturatedFat: Double?,
    val transFat: Double?,
    val vitaminC: Double?,
    val vitaminD: Double?,
    val vitaminE: Double?,
    val alcohol: Double?,
    val addedSugars: Double?,
    /**
     * Share of the day's calories (0..1) that came from entries carrying a value
     * for the nutrient — the denominator every extended total was missing. Falls
     * back to the entry-count share on a zero-calorie day.
     */
    val omega3Coverage: Double,
    val omega6Coverage: Double,
    val sodiumCoverage: Double,
    val caffeineCoverage: Double,
    val saturatedFatCoverage: Double,
    val transFatCoverage: Double,
    val vitaminCCoverage: Double,
    val vitaminDCoverage: Double,
    val vitaminECoverage: Double,
    val alcoholCoverage: Double,
    val addedSugarsCoverage: Double,
)

/** Per-entry resolved nutrients (the on-device equivalent of `getExtendedNutrientEntries`). */
data class ExtendedNutrientEntry(
    val date: String,
    val mealType: String,
    val eatenAt: String?,
    val foodId: String?,
    val recipeId: String?,
    val foodName: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val novaGroup: Int?,
    val omega3: Double?,
    val omega6: Double?,
    val sodium: Double?,
    val caffeine: Double?,
    val saturatedFat: Double?,
    val transFat: Double?,
    val vitaminC: Double?,
    val vitaminD: Double?,
    val vitaminE: Double?,
    val alcohol: Double?,
    val addedSugars: Double?,
)

/** Per-entry meal-timing row (the on-device equivalent of `getMealTimingData`). */
data class MealTimingRow(
    val date: String,
    val mealType: String,
    val eatenAt: String?,
    val foodId: String?,
    val recipeId: String?,
    val calories: Double,
    val foodName: String,
)

/** Per-entry food-diversity row (the on-device equivalent of `getFoodDiversityData`). */
data class FoodDiversityRow(
    val date: String,
    val foodId: String?,
    val recipeId: String?,
    val foodName: String,
    val novaGroup: Int?,
)

/** One day of the weight/food correlation series (the on-device equivalent of `getWeightFoodSeries`). */
data class WeightFoodPoint(
    val date: String,
    val calories: Double?,
    val weightKg: Double?,
    val movingAvg: Double?,
)

/** Sleep night paired with the previous day's evening calories (`getSleepFoodCorrelationData`). */
data class SleepFoodPoint(
    val date: String,
    val eveningCalories: Double?,
    val sleepDurationMinutes: Int,
    val sleepQuality: Int,
)

/** A weight measurement on a date. */
data class WeightRow(
    val entryDate: String,
    val weightKg: Double,
)

/** A sleep measurement on a date. */
data class SleepRow(
    val entryDate: String,
    val durationMinutes: Int,
    val quality: Int,
)

// --- SQL-semantics primitives ----------------------------------------------

/** `a / NULLIF(b, 0)`: null when the divisor is zero, otherwise the quotient. */
internal fun nullDiv(
    a: Double,
    b: Double,
): Double? = if (b == 0.0) null else a / b

/** `SUM(values)`: ignores nulls; null only when every value is null. */
internal fun nullSum(values: List<Double?>): Double? {
    var acc = 0.0
    var any = false
    for (v in values) {
        if (v != null) {
            acc += v
            any = true
        }
    }
    return if (any) acc else null
}

/**
 * Calorie-weighted share of the rows whose nutrient value is present; entry-count
 * share on a zero-calorie day. Mirrors the TS `coverageShare`.
 */
internal fun coverageShare(rows: List<Pair<Double, Boolean>>): Double {
    if (rows.isEmpty()) return 0.0
    val totalKcal = rows.sumOf { it.first }
    if (totalKcal > 0) {
        return rows.sumOf { if (it.second) it.first else 0.0 } / totalKcal
    }
    return rows.count { it.second }.toDouble() / rows.size
}

// --- recipe macro resolution (the recipe_macros / recipe_extended CTEs) ------

private class ResolvedRecipe(
    val calories: Double?,
    val protein: Double?,
    val carbs: Double?,
    val fat: Double?,
    val fiber: Double?,
    val omega3: Double?,
    val omega6: Double?,
    val sodium: Double?,
    val caffeine: Double?,
    val saturatedFat: Double?,
    val transFat: Double?,
    val vitaminC: Double?,
    val vitaminD: Double?,
    val vitaminE: Double?,
    val alcohol: Double?,
    val addedSugars: Double?,
)

/**
 * Per-serving recipe nutrient:
 * `SUM(food.nutrient * qty / NULLIF(food.servingSize, 0)) / NULLIF(recipe.totalServings, 0)`.
 * Ingredients whose food is missing or whose nutrient is null contribute nothing
 * (matching the INNER JOIN + NULL-skipping SUM); an all-null result is null.
 */
private fun recipePerServing(
    recipe: AggRecipe,
    foodsById: Map<String, AggFood>,
    nutrient: (AggFood) -> Double?,
): Double? {
    val terms =
        recipe.ingredients.mapNotNull { ing ->
            val food = foodsById[ing.foodId] ?: return@mapNotNull null
            val value = nutrient(food) ?: return@mapNotNull null
            nullDiv(value * ing.quantity, food.servingSize)
        }
    if (terms.isEmpty()) return null
    return nullDiv(terms.sum(), recipe.totalServings)
}

private fun resolveRecipes(
    recipes: List<AggRecipe>,
    foodsById: Map<String, AggFood>,
): Map<String, ResolvedRecipe> =
    recipes.associate { r ->
        r.id to
            ResolvedRecipe(
                calories = recipePerServing(r, foodsById) { it.calories },
                protein = recipePerServing(r, foodsById) { it.protein },
                carbs = recipePerServing(r, foodsById) { it.carbs },
                fat = recipePerServing(r, foodsById) { it.fat },
                fiber = recipePerServing(r, foodsById) { it.fiber },
                omega3 = recipePerServing(r, foodsById) { it.omega3 },
                omega6 = recipePerServing(r, foodsById) { it.omega6 },
                sodium = recipePerServing(r, foodsById) { it.sodium },
                caffeine = recipePerServing(r, foodsById) { it.caffeine },
                saturatedFat = recipePerServing(r, foodsById) { it.saturatedFat },
                transFat = recipePerServing(r, foodsById) { it.transFat },
                vitaminC = recipePerServing(r, foodsById) { it.vitaminC },
                vitaminD = recipePerServing(r, foodsById) { it.vitaminD },
                vitaminE = recipePerServing(r, foodsById) { it.vitaminE },
                alcohol = recipePerServing(r, foodsById) { it.alcohol },
                addedSugars = recipePerServing(r, foodsById) { it.addedSugars },
            )
    }

// --- per-entry resolution (the COALESCE expressions) ------------------------

/** `COALESCE(food.macro, recipe.macro, quick.macro, 0) * servings` — always numeric. */
private fun entryCore(
    entry: AggEntry,
    food: AggFood?,
    recipe: ResolvedRecipe?,
    foodMacro: (AggFood) -> Double,
    recipeMacro: (ResolvedRecipe) -> Double?,
    quick: Double?,
): Double {
    val base = food?.let(foodMacro) ?: recipe?.let(recipeMacro) ?: quick ?: 0.0
    return base * entry.servings
}

/** `COALESCE(food.nutrient, recipe.nutrient) * servings` — null (no quick fallback) when both absent. */
private fun entryExtended(
    entry: AggEntry,
    food: AggFood?,
    recipe: ResolvedRecipe?,
    foodNutrient: (AggFood) -> Double?,
    recipeNutrient: (ResolvedRecipe) -> Double?,
): Double? {
    val base = food?.let(foodNutrient) ?: recipe?.let(recipeNutrient) ?: return null
    return base * entry.servings
}

private fun foodNameOf(
    entry: AggEntry,
    food: AggFood?,
): String = entry.foodName ?: entry.quickName ?: "Unknown"

// --- public aggregations ----------------------------------------------------

/**
 * Per-day nutrient totals across [entries], resolving foods and recipes the same
 * way the server does. Returned sorted by date ascending; only dates with at
 * least one entry appear. Mirrors `getDailyNutrientTotals`.
 */
fun aggregateDailyNutrientTotals(
    entries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
): List<DailyNutrientTotals> {
    val foodsById = foods.associateBy { it.id }
    val resolved = resolveRecipes(recipes, foodsById)

    val byDate = entries.groupBy { it.date }
    return byDate.keys
        .sorted()
        .map { date ->
            val dayEntries = byDate.getValue(date)
            val rows =
                dayEntries.map { e ->
                    val food = e.foodId?.let { foodsById[it] }
                    val recipe = e.recipeId?.let { resolved[it] }
                    EntryNutrients(e, food, recipe)
                }
            val kcal = rows.map { it.core({ f -> f.calories }, { r -> r.calories }, it.entry.quickCalories) }

            fun cov(values: List<Double?>): Double = coverageShare(values.mapIndexed { i, v -> Pair(kcal[i], v != null) })
            val omega3s = rows.map { it.ext({ f -> f.omega3 }, { r -> r.omega3 }) }
            val omega6s = rows.map { it.ext({ f -> f.omega6 }, { r -> r.omega6 }) }
            val sodiums = rows.map { it.ext({ f -> f.sodium }, { r -> r.sodium }) }
            val caffeines = rows.map { it.ext({ f -> f.caffeine }, { r -> r.caffeine }) }
            val saturatedFats = rows.map { it.ext({ f -> f.saturatedFat }, { r -> r.saturatedFat }) }
            val transFats = rows.map { it.ext({ f -> f.transFat }, { r -> r.transFat }) }
            val vitaminCs = rows.map { it.ext({ f -> f.vitaminC }, { r -> r.vitaminC }) }
            val vitaminDs = rows.map { it.ext({ f -> f.vitaminD }, { r -> r.vitaminD }) }
            val vitaminEs = rows.map { it.ext({ f -> f.vitaminE }, { r -> r.vitaminE }) }
            val alcohols = rows.map { it.ext({ f -> f.alcohol }, { r -> r.alcohol }) }
            val addedSugarsList = rows.map { it.ext({ f -> f.addedSugars }, { r -> r.addedSugars }) }
            DailyNutrientTotals(
                date = date,
                calories = kcal.sum(),
                protein = rows.sumOf { it.core({ f -> f.protein }, { r -> r.protein }, it.entry.quickProtein) },
                carbs = rows.sumOf { it.core({ f -> f.carbs }, { r -> r.carbs }, it.entry.quickCarbs) },
                fat = rows.sumOf { it.core({ f -> f.fat }, { r -> r.fat }, it.entry.quickFat) },
                fiber = rows.sumOf { it.core({ f -> f.fiber }, { r -> r.fiber }, it.entry.quickFiber) },
                omega3 = nullSum(omega3s),
                omega6 = nullSum(omega6s),
                sodium = nullSum(sodiums),
                caffeine = nullSum(caffeines),
                saturatedFat = nullSum(saturatedFats),
                transFat = nullSum(transFats),
                vitaminC = nullSum(vitaminCs),
                vitaminD = nullSum(vitaminDs),
                vitaminE = nullSum(vitaminEs),
                alcohol = nullSum(alcohols),
                addedSugars = nullSum(addedSugarsList),
                omega3Coverage = cov(omega3s),
                omega6Coverage = cov(omega6s),
                sodiumCoverage = cov(sodiums),
                caffeineCoverage = cov(caffeines),
                saturatedFatCoverage = cov(saturatedFats),
                transFatCoverage = cov(transFats),
                vitaminCCoverage = cov(vitaminCs),
                vitaminDCoverage = cov(vitaminDs),
                vitaminECoverage = cov(vitaminEs),
                alcoholCoverage = cov(alcohols),
                addedSugarsCoverage = cov(addedSugarsList),
            )
        }
}

/**
 * Per-entry resolved nutrients across [entries]. Mirrors `getExtendedNutrientEntries`;
 * sorted by (date, eatenAt) so downstream timing logic sees the same order as the server.
 */
fun extendedNutrientEntries(
    entries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
): List<ExtendedNutrientEntry> {
    val foodsById = foods.associateBy { it.id }
    val resolved = resolveRecipes(recipes, foodsById)

    return entries.sortedByEntryOrder().map { e ->
        val food = e.foodId?.let { foodsById[it] }
        val recipe = e.recipeId?.let { resolved[it] }
        val n = EntryNutrients(e, food, recipe)
        ExtendedNutrientEntry(
            date = e.date,
            mealType = e.mealType,
            eatenAt = e.eatenAt,
            foodId = e.foodId,
            recipeId = e.recipeId,
            foodName = foodNameOf(e, food),
            calories = n.core({ f -> f.calories }, { r -> r.calories }, e.quickCalories),
            protein = n.core({ f -> f.protein }, { r -> r.protein }, e.quickProtein),
            carbs = n.core({ f -> f.carbs }, { r -> r.carbs }, e.quickCarbs),
            fat = n.core({ f -> f.fat }, { r -> r.fat }, e.quickFat),
            fiber = n.core({ f -> f.fiber }, { r -> r.fiber }, e.quickFiber),
            novaGroup = food?.novaGroup,
            omega3 = n.ext({ f -> f.omega3 }, { r -> r.omega3 }),
            omega6 = n.ext({ f -> f.omega6 }, { r -> r.omega6 }),
            sodium = n.ext({ f -> f.sodium }, { r -> r.sodium }),
            caffeine = n.ext({ f -> f.caffeine }, { r -> r.caffeine }),
            saturatedFat = n.ext({ f -> f.saturatedFat }, { r -> r.saturatedFat }),
            transFat = n.ext({ f -> f.transFat }, { r -> r.transFat }),
            vitaminC = n.ext({ f -> f.vitaminC }, { r -> r.vitaminC }),
            vitaminD = n.ext({ f -> f.vitaminD }, { r -> r.vitaminD }),
            vitaminE = n.ext({ f -> f.vitaminE }, { r -> r.vitaminE }),
            alcohol = n.ext({ f -> f.alcohol }, { r -> r.alcohol }),
            addedSugars = n.ext({ f -> f.addedSugars }, { r -> r.addedSugars }),
        )
    }
}

/** Per-entry calories + name, sorted by (date, eatenAt). Mirrors `getMealTimingData`. */
fun mealTimingRows(
    entries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
): List<MealTimingRow> {
    val foodsById = foods.associateBy { it.id }
    val resolved = resolveRecipes(recipes, foodsById)

    return entries.sortedByEntryOrder().map { e ->
        val food = e.foodId?.let { foodsById[it] }
        val recipe = e.recipeId?.let { resolved[it] }
        val n = EntryNutrients(e, food, recipe)
        MealTimingRow(
            date = e.date,
            mealType = e.mealType,
            eatenAt = e.eatenAt,
            foodId = e.foodId,
            recipeId = e.recipeId,
            calories = n.core({ f -> f.calories }, { r -> r.calories }, e.quickCalories),
            foodName = foodNameOf(e, food),
        )
    }
}

/** Per-entry food identity + NOVA group, sorted by date. Mirrors `getFoodDiversityData`. */
fun foodDiversityRows(
    entries: List<AggEntry>,
    foods: List<AggFood>,
): List<FoodDiversityRow> {
    val foodsById = foods.associateBy { it.id }
    return entries.sortedBy { it.date }.map { e ->
        val food = e.foodId?.let { foodsById[it] }
        FoodDiversityRow(
            date = e.date,
            foodId = e.foodId,
            recipeId = e.recipeId,
            foodName = foodNameOf(e, food),
            novaGroup = food?.novaGroup,
        )
    }
}

/**
 * Daily calories joined with weight measurements, plus a trailing 7-calendar-day
 * moving average of weight. Mirrors `getWeightFoodSeries`: the window is the
 * current day and the six prior calendar days (not the prior six samples), and
 * a day with no weight contributes nothing.
 */
fun weightFoodSeries(
    entries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
    weights: List<WeightRow>,
): List<WeightFoodPoint> {
    val caloriesByDate =
        aggregateDailyNutrientTotals(entries, foods, recipes).associate { it.date to it.calories }
    val weightByDate = weights.associate { it.entryDate to it.weightKg }

    val dates = (caloriesByDate.keys + weightByDate.keys).distinct().sorted()
    val epochDays = dates.map { LocalDate.parse(it).toEpochDays() }

    return dates.indices.map { i ->
        val windowStart = epochDays[i] - 6
        var sum = 0.0
        var count = 0
        var j = i
        while (j >= 0 && epochDays[j] >= windowStart) {
            weightByDate[dates[j]]?.let {
                sum += it
                count++
            }
            j--
        }
        WeightFoodPoint(
            date = dates[i],
            calories = caloriesByDate[dates[i]],
            weightKg = weightByDate[dates[i]],
            movingAvg = if (count > 0) sum / count else null,
        )
    }
}

/**
 * Pairs each sleep night with the prior day's evening calories. Mirrors
 * `getSleepFoodCorrelationData`, but the caller pre-filters [eveningEntries] to
 * entries eaten at/after the local evening cutoff (the server does this in SQL
 * with a timezone-aware `EXTRACT(HOUR ...)`).
 */
fun sleepFoodCorrelation(
    eveningEntries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
    sleep: List<SleepRow>,
): List<SleepFoodPoint> {
    val eveningCaloriesByDate =
        aggregateDailyNutrientTotals(eveningEntries, foods, recipes).associate { it.date to it.calories }

    return sleep.map { night ->
        val prevDate = LocalDate.parse(night.entryDate).toEpochDays() - 1
        val prevDateStr = LocalDate.fromEpochDays(prevDate).toString()
        SleepFoodPoint(
            date = night.entryDate,
            eveningCalories = eveningCaloriesByDate[prevDateStr],
            sleepDurationMinutes = night.durationMinutes,
            sleepQuality = night.quality,
        )
    }
}

// --- shared per-entry helper ------------------------------------------------

/** Bundles an entry with its resolved food/recipe so the macro accessors read cleanly. */
private class EntryNutrients(
    val entry: AggEntry,
    val food: AggFood?,
    val recipe: ResolvedRecipe?,
) {
    fun core(
        foodMacro: (AggFood) -> Double,
        recipeMacro: (ResolvedRecipe) -> Double?,
        quick: Double?,
    ): Double = entryCore(entry, food, recipe, foodMacro, recipeMacro, quick)

    fun ext(
        foodNutrient: (AggFood) -> Double?,
        recipeNutrient: (ResolvedRecipe) -> Double?,
    ): Double? = entryExtended(entry, food, recipe, foodNutrient, recipeNutrient)
}

/** Stable (date, eatenAt) ordering matching the server's `ORDER BY date, eatenAt`. */
private fun List<AggEntry>.sortedByEntryOrder(): List<AggEntry> = sortedWith(compareBy({ it.date }, { it.eatenAt ?: "" }))
