package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

class MealRegularityTest {
    @Test
    fun noEatenAtEntriesReturnsEmpty() {
        val entries =
            listOf(
                RegularityInputEntry(date = "2024-01-01", mealType = "Breakfast", eatenAt = null),
                RegularityInputEntry(date = "2024-01-02", mealType = "Breakfast", eatenAt = null),
            )
        val result = computeMealRegularity(entries)
        assertEquals(emptyList(), result.meals)
        assertEquals(0.0, result.overallScore)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0, result.sampleSize)
    }

    @Test
    fun highRegularityWhenStddevBelow30() {
        // Breakfast every day at ~08:00, very consistent (stddev < 30 min)
        val entries =
            (1..14).map { i ->
                val date = "2024-01-${pad2(i)}"
                RegularityInputEntry(date = date, mealType = "Breakfast", eatenAt = "${date}T08:0${i % 10}:00Z")
            }
        val result = computeMealRegularity(entries)
        assertEquals(1, result.meals.size)
        assertEquals("high", result.meals[0].regularity)
        assertTrue(result.meals[0].stddevMinutes < 30)
    }

    @Test
    fun lowRegularityWhenStddevAbove60() {
        // Breakfast at wildly varying times (hour 6 to 13 = 420 to 780 min)
        val times = listOf(6, 13, 7, 12, 6, 13, 7, 12, 6, 13)
        val entries =
            times.mapIndexed { i, hour ->
                val date = "2024-01-${pad2(i + 1)}"
                RegularityInputEntry(date = date, mealType = "Breakfast", eatenAt = "${date}T${pad2(hour)}:00:00Z")
            }
        val result = computeMealRegularity(entries)
        assertEquals(1, result.meals.size)
        assertEquals("low", result.meals[0].regularity)
        assertTrue(result.meals[0].stddevMinutes > 60)
    }

    @Test
    fun overallScoreCalculation() {
        // All meals at exact same time => stddev=0 => score=100
        val entries =
            (1..10).map { i ->
                val date = "2024-01-${pad2(i)}"
                RegularityInputEntry(date = date, mealType = "Lunch", eatenAt = "${date}T12:00:00Z")
            }
        val result = computeMealRegularity(entries)
        assertEquals(100.0, result.overallScore, 0.001)
    }

    @Test
    fun sampleSizeCountsUniqueDates() {
        val entries =
            listOf(
                RegularityInputEntry("2024-01-01", "Breakfast", "2024-01-01T08:00:00Z"),
                RegularityInputEntry("2024-01-01", "Lunch", "2024-01-01T12:00:00Z"),
                RegularityInputEntry("2024-01-02", "Breakfast", "2024-01-02T08:00:00Z"),
            )
        val result = computeMealRegularity(entries)
        assertEquals(2, result.sampleSize)
    }

    @Test
    fun earliestTimePerMealPerDayUsed() {
        // Two breakfast entries on same day — should use earliest (08:00 not 09:00)
        val entries =
            listOf(
                RegularityInputEntry("2024-01-01", "Breakfast", "2024-01-01T09:00:00Z"),
                RegularityInputEntry("2024-01-01", "Breakfast", "2024-01-01T08:00:00Z"),
                RegularityInputEntry("2024-01-02", "Breakfast", "2024-01-02T08:00:00Z"),
            )
        val result = computeMealRegularity(entries)
        assertEquals(1, result.meals.size)
        val meal = result.meals[0]
        // Both days at 08:00 => stddev = 0
        assertEquals(0.0, meal.stddevMinutes, 0.001)
    }
}
