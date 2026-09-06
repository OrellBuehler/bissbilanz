package com.bissbilanz.android.widget

import com.bissbilanz.model.Entry
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The day-overview widget's meal list. Grouping on the raw meal type would split
 * "snack" from "Snacks" into two rows — the same bug the shared `normalizeMealType`
 * exists to prevent — and dropping the empty defaults would make the widget's height
 * jump around as the day fills in.
 */
class MealBreakdownTest {
    @Test
    fun alwaysShowsTheFourDefaultMealsInOrder() {
        val rows = mealBreakdown(emptyList())

        assertEquals(listOf("Breakfast", "Lunch", "Dinner", "Snacks"), rows.map { it.mealType })
        assertEquals(listOf(0.0, 0.0, 0.0, 0.0), rows.map { it.calories })
    }

    @Test
    fun foldsLegacyMealAliasesIntoTheirCanonicalMeal() {
        val rows = mealBreakdown(listOf(entry("snack", 120.0), entry("Snacks", 80.0)))

        assertEquals(1, rows.count { it.mealType == "Snacks" })
        assertEquals(200.0, rows.single { it.mealType == "Snacks" }.calories)
    }

    @Test
    fun appendsCustomMealTypesSortedAfterTheDefaults() {
        val rows = mealBreakdown(listOf(entry("Supper", 300.0), entry("Brunch", 400.0)))

        assertEquals(
            listOf("Breakfast", "Lunch", "Dinner", "Snacks", "Brunch", "Supper"),
            rows.map { it.mealType },
        )
        assertEquals(400.0, rows.single { it.mealType == "Brunch" }.calories)
    }

    @Test
    fun sumsServingsRatherThanCountingEntries() {
        val rows = mealBreakdown(listOf(entry("Lunch", 100.0, servings = 2.5)))

        assertEquals(250.0, rows.single { it.mealType == "Lunch" }.calories)
    }

    private fun entry(
        mealType: String,
        calories: Double,
        servings: Double = 1.0,
    ): Entry =
        Entry(
            id = "entry-$mealType-$calories",
            foodId = "food",
            date = "2026-09-06",
            mealType = mealType,
            servings = servings,
            foodName = "food",
            calories = calories,
        )
}
