package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit coverage for the on-device aggregation transforms. The two cross-language
 * pieces ([calculateMaintenance] and [aggregateDailyNutrientTotals]) are also
 * locked to the TS reference by the golden-vector parity suite; this file covers
 * the per-entry / series transforms that the platform data-loaders consume.
 */
class AggregationTest {
    private val oats =
        AggFood(id = "oats", servingSize = 40.0, calories = 150.0, protein = 5.0, carbs = 27.0, fat = 3.0, fiber = 4.0)
    private val salmon =
        AggFood(
            id = "salmon",
            servingSize = 100.0,
            calories = 208.0,
            protein = 20.0,
            carbs = 0.0,
            fat = 13.0,
            fiber = 0.0,
            novaGroup = 1,
            omega3 = 2.3,
            sodium = 59.0,
        )
    private val rice =
        AggFood(id = "rice", servingSize = 50.0, calories = 180.0, protein = 3.3, carbs = 39.0, fat = 0.4, fiber = 0.6)

    private val bowl =
        AggRecipe(
            id = "bowl",
            totalServings = 2.0,
            ingredients = listOf(AggRecipeIngredient("salmon", 150.0), AggRecipeIngredient("rice", 120.0)),
        )

    @Test
    fun dailyTotalsResolveFoodRecipeAndQuick() {
        val entries =
            listOf(
                AggEntry(date = "2025-03-01", mealType = "breakfast", servings = 2.0, foodId = "oats"),
                AggEntry(date = "2025-03-01", mealType = "lunch", servings = 1.5, recipeId = "bowl"),
                AggEntry(
                    date = "2025-03-01",
                    mealType = "snack",
                    servings = 1.0,
                    quickName = "Bar",
                    quickCalories = 200.0,
                    quickProtein = 20.0,
                ),
            )
        val totals = aggregateDailyNutrientTotals(entries, listOf(oats, salmon, rice), listOf(bowl))
        assertEquals(1, totals.size)
        // oats 300 + recipe (744/2)*1.5=558 + quick 200 = 1058
        assertEquals(1058.0, totals[0].calories, 1e-9)
        // omega3 only from the recipe's salmon: (2.3*150/100)/2*1.5 = 2.5875
        assertEquals(2.5875, totals[0].omega3!!, 1e-9)
        // no carbs nutrient carries omega6 anywhere -> null
        assertNull(totals[0].omega6)
    }

    @Test
    fun zeroServingSizeAndZeroTotalServingsContributeNothing() {
        val zeroFood = AggFood(id = "z", servingSize = 0.0, calories = 999.0, protein = 9.0, carbs = 9.0, fat = 9.0, fiber = 9.0)
        val degenerate = AggRecipe(id = "deg", totalServings = 0.0, ingredients = listOf(AggRecipeIngredient("oats", 80.0)))
        val entries =
            listOf(
                AggEntry(date = "2025-03-02", mealType = "a", servings = 1.0, foodId = "z"),
                AggEntry(date = "2025-03-02", mealType = "b", servings = 1.0, recipeId = "deg"),
            )
        val totals = aggregateDailyNutrientTotals(entries, listOf(oats, zeroFood), listOf(degenerate))
        // zero-serving food -> NULLIF divide-by-zero is only inside recipes; a direct
        // food entry still uses its stored calories, so only the recipe collapses to 0.
        assertEquals(999.0, totals[0].calories, 1e-9)
        assertNull(totals[0].omega3)
    }

    @Test
    fun extendedEntriesSortByDateThenEatenAtAndCarryNova() {
        val entries =
            listOf(
                AggEntry(date = "2025-03-01", mealType = "dinner", servings = 1.0, foodId = "salmon", eatenAt = "2025-03-01T20:00:00Z"),
                AggEntry(date = "2025-03-01", mealType = "breakfast", servings = 2.0, foodId = "oats", eatenAt = "2025-03-01T08:00:00Z"),
            )
        val rows = extendedNutrientEntries(entries, listOf(oats, salmon), emptyList())
        assertEquals(listOf("oats", "salmon"), rows.map { it.foodId })
        assertEquals(1, rows[1].novaGroup)
        assertNull(rows[0].novaGroup)
        assertEquals(59.0, rows[1].sodium!!, 1e-9)
    }

    @Test
    fun foodNameFallsBackToQuickNameThenUnknown() {
        val entries =
            listOf(
                AggEntry(date = "2025-03-01", mealType = "snack", servings = 1.0, quickName = "Homemade"),
                AggEntry(date = "2025-03-01", mealType = "snack", servings = 1.0),
            )
        val rows = foodDiversityRows(entries, emptyList())
        assertEquals(listOf("Homemade", "Unknown"), rows.map { it.foodName })
    }

    @Test
    fun weightFoodSeriesTrailing7DayWindowSkipsGaps() {
        val weights =
            listOf(
                WeightRow("2025-03-01", 80.0),
                WeightRow("2025-03-05", 79.6),
                WeightRow("2025-03-12", 79.2),
            )
        val series = weightFoodSeries(emptyList(), emptyList(), emptyList(), weights)
        assertEquals(listOf("2025-03-01", "2025-03-05", "2025-03-12"), series.map { it.date })
        // day 5 window covers Feb 27..Mar 5 -> avg(80.0, 79.6)
        assertEquals(79.8, series[1].movingAvg!!, 1e-9)
        // day 12 window is Mar 6..12 -> Mar 1 and Mar 5 both fall outside, only Mar 12
        assertEquals(79.2, series[2].movingAvg!!, 1e-9)
    }

    @Test
    fun sleepFoodPairsPreviousDayEveningCalories() {
        val eveningEntries =
            listOf(AggEntry(date = "2025-03-01", mealType = "dinner", servings = 1.0, foodId = "salmon"))
        val sleep = listOf(SleepRow("2025-03-02", 420, 4), SleepRow("2025-03-01", 400, 3))
        val rows = sleepFoodCorrelation(eveningEntries, listOf(salmon), emptyList(), sleep)
        val byDate = rows.associateBy { it.date }
        assertEquals(208.0, byDate.getValue("2025-03-02").eveningCalories!!, 1e-9)
        assertNull(byDate.getValue("2025-03-01").eveningCalories)
    }

    @Test
    fun maintenanceReturnsNullForInvalidWindow() {
        assertNull(calculateMaintenance(MaintenanceInput(weightChangeKg = -1.0, avgDailyCalories = 2000.0, days = 0)))
        assertNull(calculateMaintenance(MaintenanceInput(weightChangeKg = -1.0, avgDailyCalories = -1.0, days = 7)))
    }

    @Test
    fun maintenanceLossAddsDeficitBack() {
        val result = calculateMaintenance(MaintenanceInput(weightChangeKg = -1.2, avgDailyCalories = 2100.0, days = 28))
        assertTrue(result != null)
        assertEquals(2354.0, result.maintenanceCalories, 1e-9)
        assertEquals(0.3, result.muscleRatio, 1e-9)
    }
}
