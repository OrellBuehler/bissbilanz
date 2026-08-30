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

/**
 * One nutrient's average intake against its reference. [ratio] is 1.0 at target;
 * for sodium the target is the CDRR ceiling, so a ratio above 1.0 means over it.
 * [coveredDays] is how many logged days actually carried a value for the
 * nutrient — an unmeasured day is not a zero-intake day.
 */
data class NutrientAdequacyItem(
    val rda: RdaEntry,
    val ratio: Double,
    val coveredDays: Int = 0,
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

/**
 * [InsightsInput] with the standard cutoffs applied.
 *
 * Exists for Swift: Kotlin/Native does not carry a data class's default arguments
 * into the generated memberwise initialiser, so iOS would otherwise have to name
 * the two cutoff hours itself and could drift from Android.
 */
fun defaultInsightsInput(
    entries: List<AggEntry>,
    foods: List<AggFood>,
    recipes: List<AggRecipe>,
    weights: List<WeightRow>,
    sleep: List<InsightsSleepRow>,
    timeZoneId: String,
): InsightsInput =
    InsightsInput(
        entries = entries,
        foods = foods,
        recipes = recipes,
        weights = weights,
        sleep = sleep,
        timeZoneId = timeZoneId,
    )

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

    // TDEE feeds the plateau and forecast cards too, so estimate it once.
    val weightSeries = weightFoodData.map { Pair(it.date, it.weightKg) }
    val calorieSeries = weightFoodData.map { Pair(it.date, it.calories) }
    val tdee = computeAdaptiveTDEE(weightSeries, calorieSeries)
    // The weight tab's timing card and the sleep tab's pre-sleep card show the
    // same summary.
    val mealTiming = mealTimingOf(timingData, tz)
    // Nutrient/weight screens correlate against the day-over-day weight *change*:
    // intake and body weight both trend, and two trending levels correlate
    // spuriously.
    val weightDeltas = weightDeltasOf(weightFoodData)
    val latestWeightKg = input.weights.maxByOrNull { it.entryDate }?.weightKg

    return InsightsBundle(
        nova = computeNOVAScore(extData.map { Pair(it.calories, it.novaGroup) }),
        omega =
            computeOmegaRatio(
                dailyData.map {
                    OmegaDay(it.date, it.omega3 ?: 0.0, it.omega6 ?: 0.0, minOf(it.omega3Coverage, it.omega6Coverage))
                },
            ),
        dii =
            computeDIIScore(
                dailyData.map {
                    DIIInput(
                        fiber = it.fiber,
                        omega3 = it.omega3,
                        vitaminC = it.vitaminC,
                        vitaminD = it.vitaminD,
                        vitaminE = it.vitaminE,
                        saturatedFat = it.saturatedFat,
                        transFat = it.transFat,
                        alcohol = it.alcohol,
                        caffeine = it.caffeine,
                        coverage =
                            mapOf(
                                "omega3" to it.omega3Coverage,
                                "vitaminC" to it.vitaminCCoverage,
                                "vitaminD" to it.vitaminDCoverage,
                                "vitaminE" to it.vitaminECoverage,
                                "saturatedFat" to it.saturatedFatCoverage,
                                "transFat" to it.transFatCoverage,
                                "alcohol" to it.alcoholCoverage,
                                "caffeine" to it.caffeineCoverage,
                            ),
                    )
                },
            ),
        tef = computeTEF(dailyData.map { TEFInput(it.protein, it.carbs, it.fat, it.calories, it.alcohol) }),
        proteinDistribution =
            computeProteinDistribution(
                extData.map { Triple(it.date, it.mealType, it.protein) },
                proteinPerMealThreshold(latestWeightKg),
            ),
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
        plateau = detectPlateau(weightSeries, calorieSeries, tdee.estimatedTDEE),
        weightForecast = projectWeight(weightSeries, tdee.weeklyRate, tdee.confidence),
        sodiumWeight =
            computeSodiumWeightCorrelation(
                dailyData.mapNotNull { day -> day.sodium?.let { SodiumDay(day.date, it, day.sodiumCoverage) } },
                weightSeries,
            ),
        caloricLag = computeCaloricLag(calorieSeries, weightSeries),
        macroImpact =
            computeNutrientOutcomeCorrelations(
                dailyData.map { Pair(it.date, macroMapOf(it.protein, it.carbs, it.fat, it.fiber)) },
                weightDeltas,
            ),
        mealTiming = mealTiming,
        nutrientAdequacy = computeNutrientAdequacy(dailyData),
        foodSleep =
            detectFoodSleepPatterns(
                lateMealFoods(extData, tz, input.lateMealCutoffHour),
                sleepFoodData.map { SleepQualityPoint(it.date, it.sleepQuality.toDouble()) },
            ),
        nutrientSleep =
            computeNutrientOutcomeCorrelations(
                dailyData.map { Pair(it.date, macroMapOf(it.protein, it.carbs, it.fat, it.fiber)) },
                sleepFoodData.map { Pair(it.date, it.sleepQuality.toDouble()) },
            ),
        preSleepTiming = mealTiming,
        caffeineSleep =
            computeCaffeineSleepCutoff(
                extData.filter { (it.caffeine ?: 0.0) > 0.0 }.map { CaffeineEntry(it.date, it.eatenAt, it.caffeine!!) },
                input.sleep.map { SleepDataPoint(it.entryDate, it.quality, it.durationMinutes.toDouble()) },
                tz,
            ),
    )
}

/**
 * Average intake per tracked nutrient, as a fraction of its reference.
 *
 * Only days whose food actually carried a value for the nutrient (at or above
 * the coverage floor) enter the mean — an unmeasured day is unknown, not zero.
 * Sex is not available in the user model, so the more conservative (higher) of
 * the male/female values is used; fiber follows the 14 g / 1000 kcal AI scaled
 * to the mean logged intake. Sodium's reference is the 2300 mg CDRR ceiling.
 */
fun computeNutrientAdequacy(days: List<DailyNutrientTotals>): List<NutrientAdequacyItem> {
    val avgCalories = days.map { it.calories }.takeIf { it.isNotEmpty() }?.average()

    fun covered(
        value: (DailyNutrientTotals) -> Double?,
        coverage: (DailyNutrientTotals) -> Double,
    ): List<Double> = days.filter { coverage(it) >= MIN_NUTRIENT_COVERAGE }.mapNotNull(value)

    val valuesByKey =
        mapOf(
            "vitaminC" to covered({ it.vitaminC }, { it.vitaminCCoverage }),
            "vitaminD" to covered({ it.vitaminD }, { it.vitaminDCoverage }),
            "vitaminE" to covered({ it.vitaminE }, { it.vitaminECoverage }),
            "sodium" to covered({ it.sodium }, { it.sodiumCoverage }),
            "omega3" to covered({ it.omega3 }, { it.omega3Coverage }),
            "omega6" to covered({ it.omega6 }, { it.omega6Coverage }),
            "fiber" to days.map { it.fiber },
        )
    return RDA_VALUES
        .filter { it.nutrientKey in ADEQUACY_KEYS }
        .map { rda ->
            val values = valuesByKey[rda.nutrientKey] ?: emptyList()
            val avg = if (values.isNotEmpty()) values.sum() / values.size else 0.0
            val per1000 = rda.per1000Kcal
            val target =
                if (per1000 != null && avgCalories != null && avgCalories > 0) {
                    per1000 * avgCalories / 1000.0
                } else {
                    maxOf(rda.rdaMale, rda.rdaFemale)
                }
            NutrientAdequacyItem(rda, if (target > 0) avg / target else 0.0, values.size)
        }
}

// --- internals --------------------------------------------------------------

/** Day-over-day weight change on every date with a weight the day before. */
private fun weightDeltasOf(series: List<WeightFoodPoint>): List<Pair<String, Double>> {
    val byDate = series.mapNotNull { p -> p.weightKg?.let { Pair(p.date, it) } }.toMap()
    return byDate.mapNotNull { (date, kg) ->
        byDate[shiftDate(date, -1)]?.let { prev -> Pair(date, kg - prev) }
    }
}

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
