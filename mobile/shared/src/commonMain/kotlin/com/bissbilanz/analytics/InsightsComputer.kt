package com.bissbilanz.analytics

/*
 * The insights screen's whole computation, in one place.
 *
 * Every analytic below used to be wired up inline in Android's
 * `InsightsViewModel`, which meant iOS could only get the same cards by
 * rewriting that wiring in Swift. The individual analytics were already shared;
 * the *glue* that turns aggregated rows into each function's input shape was not,
 * and that glue is where the two platforms would silently drift apart.
 *
 * So this file takes the same plain Agg* rows every platform can produce from its
 * own store (SQLDelight on Android, SwiftData on iOS — see Aggregation.kt) and
 * returns every result the insights UI needs. Both apps call `computeInsights`
 * and render the same numbers by construction.
 *
 * The public surface deliberately avoids Pair, Triple, List<Double> and
 * Map<String, Double>: Kotlin/Native exports those to Swift as KotlinPair /
 * [KotlinDouble] with boxed Any? components, which is painful to consume. Named
 * data classes cross the bridge cleanly. Inside, tuples are used freely.
 */

/**
 * Local hour from which an entry counts toward a night's "evening calories".
 * Mirrors the server's SQL filter for the sleep/food correlation.
 */
const val EVENING_CUTOFF_HOUR: Int = 17

/**
 * Local hour from which an entry counts as a *late* meal when attributing sleep
 * quality to individual foods.
 */
const val LATE_MEAL_CUTOFF_HOUR: Int = 19

/** Sleep night as the insights need it. Quality stays a Double here — see [computeInsights]. */
data class InsightsSleepRow(
    val entryDate: String,
    val durationMinutes: Int,
    val quality: Double,
)

data class InsightsInput(
    val entries: List<AggEntry>,
    val foods: List<AggFood>,
    val recipes: List<AggRecipe>,
    val weights: List<WeightRow>,
    val sleep: List<InsightsSleepRow>,
    val timeZoneId: String,
    /**
     * Hour (local) from which an entry counts toward a night's "evening calories".
     * 17:00 matches the server's SQL filter for the sleep/food correlation.
     */
    val eveningCutoffHour: Int = EVENING_CUTOFF_HOUR,
    /**
     * Hour (local) from which an entry counts as a *late* meal when attributing
     * sleep quality to individual foods. Deliberately later than
     * [eveningCutoffHour]: "what did you eat in the evening" and "what did you eat
     * shortly before bed" are different questions, and only the former has to
     * agree with the server.
     */
    val lateMealCutoffHour: Int = LATE_MEAL_CUTOFF_HOUR,
)

/** One nutrient's average intake against its RDA. [ratio] is 1.0 at target. */
data class NutrientAdequacyItem(
    val rda: RdaEntry,
    val ratio: Double,
)

/** Every result the insights screen renders, grouped the way the UI groups them. */
data class InsightsBundle(
    // Nutrition
    val nova: NOVAResult,
    val omega: OmegaResult,
    val dii: DIIResult,
    val tef: TEFResult,
    val proteinDistribution: ProteinDistributionResult,
    val frontLoading: FrontLoadingResult,
    val calorieCycling: CalorieCyclingResult,
    val weekdayWeekend: WeekdayWeekendResult,
    val mealRegularity: MealRegularityResult,
    val foodDiversity: FoodDiversityResult,
    // Weight
    val tdee: TDEEResult,
    val plateau: PlateauResult,
    val weightForecast: WeightForecast,
    val sodiumWeight: SodiumWeightResult,
    val caloricLag: CaloricLagResult,
    val macroImpact: List<NutrientCorrelation>,
    val mealTiming: MealTimingSummary,
    val nutrientAdequacy: List<NutrientAdequacyItem>,
    // Sleep
    val foodSleep: FoodSleepResult,
    val nutrientSleep: List<NutrientCorrelation>,
    val preSleepTiming: MealTimingSummary,
    val caffeineSleep: CaffeineSleepResult,
)

/**
 * Nutrients surfaced by the adequacy card. Intentionally limited to the seven most
 * relevant for dietary adequacy assessment — extend this set if new tracked
 * nutrient fields are added to [ExtendedNutrientEntry].
 */
private val ADEQUACY_KEYS = setOf("vitaminC", "vitaminD", "vitaminE", "sodium", "omega3", "omega6", "fiber")

/** Runs every insights analytic over [input]. Pure: same input, same bundle. */
fun computeInsights(input: InsightsInput): InsightsBundle {
    val entries = input.entries
    val foods = input.foods
    val recipes = input.recipes
    val tz = input.timeZoneId

    // The same six aggregations the server does in SQL, once, and shared by every
    // analytic below — the old per-card loads each rebuilt these from scratch.
    val extData = extendedNutrientEntries(entries, foods, recipes)
    val dailyData = aggregateDailyNutrientTotals(entries, foods, recipes)
    val timingData = mealTimingRows(entries, foods, recipes)
    val divData = foodDiversityRows(entries, foods)
    val weightFoodData = weightFoodSeries(entries, foods, recipes, input.weights)

    val eveningEntries = entries.filter { it.isAfterLocalHour(input.eveningCutoffHour, tz) }
    // sleepFoodCorrelation takes an Int quality (it mirrors the server's integer
    // column), so the round-trip through SleepRow truncates — keep that, the
    // correlation has always been computed on the truncated value.
    val sleepRows = input.sleep.map { SleepRow(it.entryDate, it.durationMinutes, it.quality.toInt()) }
    val sleepFoodData = sleepFoodCorrelation(eveningEntries, foods, recipes, sleepRows)

    val extByDate = extData.groupBy { it.date }

    // TDEE feeds the plateau and forecast cards too, so estimate it once.
    val weightSeries = weightFoodData.map { Pair(it.date, it.weightKg) }
    val calorieSeries = weightFoodData.map { Pair(it.date, it.calories) }
    val tdee = computeAdaptiveTDEE(weightSeries, calorieSeries)
    val sodiumAvg =
        extByDate.values
            .map { rows -> rows.sumOf { it.sodium ?: 0.0 } }
            .takeIf { it.isNotEmpty() }
            ?.average()

    return InsightsBundle(
        nova = computeNOVAScore(extData.map { Pair(it.calories, it.novaGroup) }),
        omega =
            computeOmegaRatio(
                extByDate.map { (date, rows) ->
                    Triple(date, rows.sumOf { it.omega3 ?: 0.0 }, rows.sumOf { it.omega6 ?: 0.0 })
                },
            ),
        dii =
            computeDIIScore(
                extByDate.map { (_, rows) ->
                    DIIInput(
                        fiber = rows.sumOf { it.fiber },
                        omega3 = rows.sumOf { it.omega3 ?: 0.0 },
                        vitaminC = rows.sumOf { it.vitaminC ?: 0.0 },
                        vitaminD = rows.sumOf { it.vitaminD ?: 0.0 },
                        vitaminE = rows.sumOf { it.vitaminE ?: 0.0 },
                        saturatedFat = rows.sumOf { it.saturatedFat ?: 0.0 },
                        transFat = rows.sumOf { it.transFat ?: 0.0 },
                        alcohol = rows.sumOf { it.alcohol ?: 0.0 },
                        caffeine = rows.sumOf { it.caffeine ?: 0.0 },
                        sodium = rows.sumOf { it.sodium ?: 0.0 },
                    )
                },
            ),
        tef = computeTEF(dailyData.map { TEFInput(it.protein, it.carbs, it.fat, it.calories) }),
        proteinDistribution = computeProteinDistribution(extData.map { Triple(it.date, it.mealType, it.protein) }),
        frontLoading = computeCalorieFrontLoading(extData.map { Triple(it.date, it.eatenAt, it.calories) }, tz),
        calorieCycling = computeCalorieCycling(dailyData.map { Pair(it.date, it.calories) }),
        weekdayWeekend =
            computeWeekdayWeekendSplit(
                dailyData.map { DayEntry(it.date, it.calories, it.protein, it.carbs, it.fat, it.fiber) },
            ),
        mealRegularity =
            computeMealRegularity(timingData.map { RegularityInputEntry(it.date, it.mealType, it.eatenAt) }, tz),
        foodDiversity = computeFoodDiversity(divData.map { FoodEntry(it.date, it.foodId, it.recipeId, it.foodName) }),
        tdee = tdee,
        plateau = detectPlateau(weightSeries, calorieSeries, tdee.estimatedTDEE, sodiumAvg),
        weightForecast = projectWeight(weightSeries, tdee.weeklyRate),
        sodiumWeight =
            computeSodiumWeightCorrelation(
                extByDate.map { (date, rows) -> Pair(date, rows.sumOf { it.sodium ?: 0.0 }) },
                weightSeries,
            ),
        caloricLag = computeCaloricLag(calorieSeries, weightSeries),
        macroImpact =
            computeNutrientOutcomeCorrelations(
                dailyData.map { Pair(it.date, macroMapOf(it.protein, it.carbs, it.fat, it.fiber)) },
                weightFoodData.mapNotNull { p -> p.weightKg?.let { Pair(p.date, it) } },
            ),
        mealTiming = mealTimingOf(timingData, tz),
        nutrientAdequacy = computeNutrientAdequacy(extData),
        foodSleep =
            detectFoodSleepPatterns(
                lateMealFoods(extData, tz, input.lateMealCutoffHour),
                sleepFoodData.map { SleepQualityPoint(it.date, it.sleepQuality.toDouble()) },
            ),
        nutrientSleep =
            computeNutrientOutcomeCorrelations(
                extByDate.map { (date, rows) ->
                    Pair(
                        date,
                        macroMapOf(
                            rows.sumOf { it.protein },
                            rows.sumOf { it.carbs },
                            rows.sumOf { it.fat },
                            rows.sumOf { it.fiber },
                        ),
                    )
                },
                sleepFoodData.map { Pair(it.date, it.sleepQuality.toDouble()) },
            ),
        preSleepTiming = mealTimingOf(timingData, tz),
        caffeineSleep =
            computeCaffeineSleepCutoff(
                extData.filter { (it.caffeine ?: 0.0) > 0.0 }.map { CaffeineEntry(it.date, it.eatenAt, it.caffeine!!) },
                input.sleep.map { SleepDataPoint(it.entryDate, it.quality, it.durationMinutes.toDouble()) },
                tz,
            ),
    )
}

/**
 * Average intake per tracked nutrient over the logged days, as a fraction of its RDA.
 *
 * Sex is not available in the user model, so the more conservative (higher) of the
 * male/female RDA is used — under-reporting adequacy is the safer error here.
 */
fun computeNutrientAdequacy(entries: List<ExtendedNutrientEntry>): List<NutrientAdequacyItem> {
    val dayCount =
        entries
            .map { it.date }
            .distinct()
            .size
            .takeIf { it > 0 } ?: 1
    val sumByKey =
        mapOf(
            "vitaminC" to entries.sumOf { it.vitaminC ?: 0.0 },
            "vitaminD" to entries.sumOf { it.vitaminD ?: 0.0 },
            "vitaminE" to entries.sumOf { it.vitaminE ?: 0.0 },
            "sodium" to entries.sumOf { it.sodium ?: 0.0 },
            "omega3" to entries.sumOf { it.omega3 ?: 0.0 },
            "omega6" to entries.sumOf { it.omega6 ?: 0.0 },
            "fiber" to entries.sumOf { it.fiber },
        )
    return RDA_VALUES
        .filter { it.nutrientKey in ADEQUACY_KEYS }
        .map { rda ->
            val avg = (sumByKey[rda.nutrientKey] ?: 0.0) / dayCount
            NutrientAdequacyItem(rda, avg / maxOf(rda.rdaMale, rda.rdaFemale))
        }
}

// --- internals --------------------------------------------------------------

private fun macroMapOf(
    protein: Double,
    carbs: Double,
    fat: Double,
    fiber: Double,
): Map<String, Double?> = mapOf("protein" to protein, "carbs" to carbs, "fat" to fat, "fiber" to fiber)

private fun AggEntry.isAfterLocalHour(
    hour: Int,
    timeZoneId: String,
): Boolean {
    val minutes = eatenAt?.let { localMinutesOfDay(it, timeZoneId) } ?: return false
    return minutes / 60 >= hour
}

/** Entries eaten close to bedtime, keyed by whichever of food/recipe identifies them. */
private fun lateMealFoods(
    extData: List<ExtendedNutrientEntry>,
    timeZoneId: String,
    cutoffHour: Int,
): List<EveningFoodEntry> =
    extData
        .filter { entry ->
            val eatenAt = entry.eatenAt ?: return@filter false
            val minutes = localMinutesOfDay(eatenAt, timeZoneId) ?: return@filter false
            minutes / 60 >= cutoffHour
        }.mapNotNull { entry ->
            val id = entry.foodId ?: entry.recipeId ?: return@mapNotNull null
            EveningFoodEntry(
                date = entry.date,
                foodId = id,
                foodName = entry.foodName,
                nutrients =
                    mapOf(
                        "calories" to entry.calories,
                        "protein" to entry.protein,
                        "carbs" to entry.carbs,
                        "fat" to entry.fat,
                        "fiber" to entry.fiber,
                    ),
            )
        }

private fun mealTimingOf(
    timingData: List<MealTimingRow>,
    timeZoneId: String,
): MealTimingSummary = extractMealTimingPatterns(timingData.map { MealEntry(it.date, it.eatenAt, it.calories) }, timeZoneId)
