package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Locks [computeInsights] to the wiring it replaced.
 *
 * Every expectation here was produced by running each analytic the way Android's
 * `InsightsViewModel` used to call it, over the fixture below. The point is not to
 * re-test the analytics themselves (they have their own files, and the shared
 * ones are golden-vector-locked against the TS server) but to prove the *glue* —
 * which rows feed which function, in which shape — still behaves identically now
 * that it is shared with iOS.
 */
class InsightsComputerTest {
    // --- fixture ------------------------------------------------------------

    private val oats =
        AggFood(
            id = "oats",
            servingSize = 40.0,
            calories = 150.0,
            protein = 5.0,
            carbs = 27.0,
            fat = 3.0,
            fiber = 4.0,
            novaGroup = 1,
            omega3 = 0.1,
            omega6 = 0.6,
            sodium = 3.0,
            vitaminC = 0.5,
            vitaminD = 0.0,
            vitaminE = 0.2,
            saturatedFat = 0.5,
        )

    private val coffee =
        AggFood(
            id = "coffee",
            servingSize = 250.0,
            calories = 5.0,
            protein = 0.3,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            novaGroup = 1,
            caffeine = 95.0,
            sodium = 5.0,
        )

    private val pizza =
        AggFood(
            id = "pizza",
            servingSize = 300.0,
            calories = 850.0,
            protein = 35.0,
            carbs = 90.0,
            fat = 35.0,
            fiber = 6.0,
            novaGroup = 4,
            omega3 = 0.3,
            omega6 = 6.0,
            sodium = 1900.0,
            saturatedFat = 14.0,
            transFat = 0.4,
            vitaminC = 4.0,
            vitaminE = 2.0,
        )

    private val foods = listOf(oats, coffee, pizza)

    /** 28 consecutive days: oats + coffee in the morning, pizza at 20:00. */
    private val entries: List<AggEntry> =
        (1..28).flatMap { day ->
            val date = "2026-03-${day.toString().padStart(2, '0')}"
            listOf(
                AggEntry(date, "Breakfast", 1.0, foodId = "oats", eatenAt = "${date}T07:30:00Z", foodName = "Oats"),
                AggEntry(date, "Breakfast", 1.0, foodId = "coffee", eatenAt = "${date}T08:00:00Z", foodName = "Coffee"),
                AggEntry(date, "Dinner", 1.0, foodId = "pizza", eatenAt = "${date}T20:00:00Z", foodName = "Pizza"),
            )
        }

    /** A steady ~0.1 kg/day loss, so TDEE and the forecast have something to fit. */
    private val weights: List<WeightRow> =
        (1..28).map { day ->
            WeightRow("2026-03-${day.toString().padStart(2, '0')}", 82.0 - day * 0.05)
        }

    private val sleep: List<InsightsSleepRow> =
        (1..28).map { day ->
            InsightsSleepRow("2026-03-${day.toString().padStart(2, '0')}", 420 + (day % 5) * 15, 3.0 + (day % 3) * 0.5)
        }

    private fun input(
        timeZoneId: String = "UTC",
        eveningCutoffHour: Int = EVENING_CUTOFF_HOUR,
        lateMealCutoffHour: Int = LATE_MEAL_CUTOFF_HOUR,
    ) = InsightsInput(
        entries = entries,
        foods = foods,
        recipes = emptyList(),
        weights = weights,
        sleep = sleep,
        timeZoneId = timeZoneId,
        eveningCutoffHour = eveningCutoffHour,
        lateMealCutoffHour = lateMealCutoffHour,
    )

    private fun assertClose(
        expected: Double,
        actual: Double,
        tolerance: Double = 1e-9,
    ) = assertTrue(abs(expected - actual) <= tolerance, "expected $expected but was $actual")

    // --- the glue: each analytic gets the rows it used to get -----------------

    @Test
    fun matchesTheViewModelWiringItReplaced() {
        val b = computeInsights(input())
        val ext = extendedNutrientEntries(entries, foods, emptyList())
        val daily = aggregateDailyNutrientTotals(entries, foods, emptyList())
        val timing = mealTimingRows(entries, foods, emptyList())
        val diversity = foodDiversityRows(entries, foods)
        val series = weightFoodSeries(entries, foods, emptyList(), weights)
        val weightSeries = series.map { Pair(it.date, it.weightKg) }
        val calorieSeries = series.map { Pair(it.date, it.calories) }
        val extByDate = ext.groupBy { it.date }

        assertEquals(computeNOVAScore(ext.map { Pair(it.calories, it.novaGroup) }), b.nova)
        assertEquals(
            computeOmegaRatio(
                extByDate.map { (date, rows) ->
                    Triple(date, rows.sumOf { it.omega3 ?: 0.0 }, rows.sumOf { it.omega6 ?: 0.0 })
                },
            ),
            b.omega,
        )
        assertEquals(computeTEF(daily.map { TEFInput(it.protein, it.carbs, it.fat, it.calories) }), b.tef)
        assertEquals(
            computeProteinDistribution(ext.map { Triple(it.date, it.mealType, it.protein) }),
            b.proteinDistribution,
        )
        assertEquals(
            computeCalorieFrontLoading(ext.map { Triple(it.date, it.eatenAt, it.calories) }, "UTC"),
            b.frontLoading,
        )
        assertEquals(computeCalorieCycling(daily.map { Pair(it.date, it.calories) }), b.calorieCycling)
        assertEquals(
            computeWeekdayWeekendSplit(
                daily.map { DayEntry(it.date, it.calories, it.protein, it.carbs, it.fat, it.fiber) },
            ),
            b.weekdayWeekend,
        )
        assertEquals(
            computeMealRegularity(timing.map { RegularityInputEntry(it.date, it.mealType, it.eatenAt) }, "UTC"),
            b.mealRegularity,
        )
        assertEquals(
            computeFoodDiversity(diversity.map { FoodEntry(it.date, it.foodId, it.recipeId, it.foodName) }),
            b.foodDiversity,
        )

        val tdee = computeAdaptiveTDEE(weightSeries, calorieSeries)
        assertEquals(tdee, b.tdee)
        assertEquals(projectWeight(weightSeries, tdee.weeklyRate), b.weightForecast)
        assertEquals(computeCaloricLag(calorieSeries, weightSeries), b.caloricLag)
        assertEquals(
            computeSodiumWeightCorrelation(
                extByDate.map { (date, rows) -> Pair(date, rows.sumOf { it.sodium ?: 0.0 }) },
                weightSeries,
            ),
            b.sodiumWeight,
        )
        assertEquals(
            extractMealTimingPatterns(timing.map { MealEntry(it.date, it.eatenAt, it.calories) }, "UTC"),
            b.mealTiming,
        )
        // The pre-sleep card renders the same summary as the weight tab's timing card.
        assertEquals(b.mealTiming, b.preSleepTiming)
    }

    @Test
    fun plateauUsesTheSharedTdeeEstimateAndAverageSodium() {
        val b = computeInsights(input())
        val series = weightFoodSeries(entries, foods, emptyList(), weights)
        val sodiumAvg =
            extendedNutrientEntries(entries, foods, emptyList())
                .groupBy { it.date }
                .values
                .map { rows -> rows.sumOf { it.sodium ?: 0.0 } }
                .average()

        assertEquals(
            detectPlateau(
                series.map { Pair(it.date, it.weightKg) },
                series.map { Pair(it.date, it.calories) },
                b.tdee.estimatedTDEE,
                sodiumAvg,
            ),
            b.plateau,
        )
    }

    @Test
    fun sleepQualityIsTruncatedForTheCorrelationButNotForCaffeine() {
        // The fixture's qualities are 3.0 / 3.5 / 4.0 — the .5 values are the ones
        // that would disappear if the caffeine path also went through SleepRow.
        val b = computeInsights(input())

        val truncated = sleep.map { SleepRow(it.entryDate, it.durationMinutes, it.quality.toInt()) }
        val evening = entries.filter { it.eatenAt!!.substring(11, 13).toInt() >= EVENING_CUTOFF_HOUR }
        val sleepFood = sleepFoodCorrelation(evening, foods, emptyList(), truncated)
        assertTrue(sleepFood.any { it.sleepQuality == 3 }, "correlation input should see truncated qualities")

        assertEquals(
            computeCaffeineSleepCutoff(
                extendedNutrientEntries(entries, foods, emptyList())
                    .filter { (it.caffeine ?: 0.0) > 0.0 }
                    .map { CaffeineEntry(it.date, it.eatenAt, it.caffeine!!) },
                sleep.map { SleepDataPoint(it.entryDate, it.quality, it.durationMinutes.toDouble()) },
                "UTC",
            ),
            b.caffeineSleep,
        )
    }

    @Test
    fun theTwoEveningCutoffsAreIndependent() {
        // Dinner is at 20:00 UTC, so it is late by both defaults.
        assertTrue(computeInsights(input()).foodSleep.foodImpacts.isNotEmpty())

        // Raising only the late-meal cutoff past 20:00 empties the food/sleep card
        // without touching the evening-calories correlation the server also computes.
        val lateRaised = computeInsights(input(lateMealCutoffHour = 22))
        assertTrue(lateRaised.foodSleep.foodImpacts.isEmpty())
        assertEquals(computeInsights(input()).nutrientSleep, lateRaised.nutrientSleep)
    }

    @Test
    fun nutrientAdequacyAveragesOverLoggedDaysAgainstTheConservativeRda() {
        val ext = extendedNutrientEntries(entries, foods, emptyList())
        val items = computeNutrientAdequacy(ext)

        assertEquals(
            setOf("vitaminC", "vitaminD", "vitaminE", "sodium", "omega3", "omega6", "fiber"),
            items.map { it.rda.nutrientKey }.toSet(),
        )

        val fiber = items.first { it.rda.nutrientKey == "fiber" }
        // 4 g (oats) + 6 g (pizza) per day, every day.
        assertClose(10.0 / maxOf(fiber.rda.rdaMale, fiber.rda.rdaFemale), fiber.ratio)

        val sodium = items.first { it.rda.nutrientKey == "sodium" }
        // 3 mg (oats) + 5 mg (coffee) + 1900 mg (pizza), against the 2300 mg RDA.
        assertClose(1908.0 / 2300.0, sodium.ratio)
    }

    @Test
    fun nutrientAdequacyDoesNotDivideByZeroOnAnEmptyRange() {
        val items = computeNutrientAdequacy(emptyList())
        assertEquals(7, items.size)
        assertTrue(items.all { it.ratio == 0.0 })
    }

    @Test
    fun macroImpactCorrelatesDailyMacrosAgainstWeight() {
        val b = computeInsights(input())
        val daily = aggregateDailyNutrientTotals(entries, foods, emptyList())
        val series = weightFoodSeries(entries, foods, emptyList(), weights)

        assertEquals(
            computeNutrientOutcomeCorrelations(
                daily.map {
                    Pair(
                        it.date,
                        mapOf<String, Double?>(
                            "protein" to it.protein,
                            "carbs" to it.carbs,
                            "fat" to it.fat,
                            "fiber" to it.fiber,
                        ),
                    )
                },
                series.mapNotNull { p -> p.weightKg?.let { Pair(p.date, it) } },
            ),
            b.macroImpact,
        )
    }

    @Test
    fun anEmptyRangeStillReturnsEveryCardMarkedInsufficient() {
        val b =
            computeInsights(
                InsightsInput(
                    entries = emptyList(),
                    foods = emptyList(),
                    recipes = emptyList(),
                    weights = emptyList(),
                    sleep = emptyList(),
                    timeZoneId = "UTC",
                ),
            )

        assertEquals(ConfidenceLevel.INSUFFICIENT, b.nova.confidence)
        assertEquals(ConfidenceLevel.INSUFFICIENT, b.tdee.confidence)
        assertEquals(ConfidenceLevel.INSUFFICIENT, b.foodDiversity.confidence)
        assertEquals(ConfidenceLevel.INSUFFICIENT, b.weekdayWeekend.confidence)
        assertTrue(b.macroImpact.isEmpty())
        assertTrue(b.nutrientSleep.isEmpty())
        assertTrue(b.foodSleep.foodImpacts.isEmpty())
        assertNotNull(b.mealTiming)
    }

    @Test
    fun theTimeZoneReachesTheTimeSensitiveAnalytics() {
        // 20:00 UTC is 21:00 in Zurich but 15:00 in New York, so the dinner entry
        // falls outside the late-meal window there.
        val zurich = computeInsights(input(timeZoneId = "Europe/Zurich"))
        val newYork = computeInsights(input(timeZoneId = "America/New_York"))

        assertTrue(zurich.foodSleep.foodImpacts.isNotEmpty())
        assertTrue(newYork.foodSleep.foodImpacts.isEmpty())
    }
}
