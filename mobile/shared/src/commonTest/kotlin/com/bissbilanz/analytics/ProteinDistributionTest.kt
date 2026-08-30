package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProteinDistributionTest {
    @Test
    fun evenDistributionScoreNear100() {
        val entries =
            listOf(
                Triple("2024-01-01", "Breakfast", 30.0),
                Triple("2024-01-01", "Lunch", 30.0),
                Triple("2024-01-01", "Dinner", 30.0),
                Triple("2024-01-02", "Breakfast", 30.0),
                Triple("2024-01-02", "Lunch", 30.0),
                Triple("2024-01-02", "Dinner", 30.0),
            )
        val result = computeProteinDistribution(entries)
        assertTrue(result.score > 90.0, "Expected score near 100 for even distribution, got ${result.score}")
        assertEquals(30.0, result.avgPerMeal)
        assertEquals(3.0, result.mealsPerDay)
    }

    @Test
    fun highlyUnevenDistributionLowScore() {
        val entries =
            listOf(
                Triple("2024-01-01", "Breakfast", 5.0),
                Triple("2024-01-01", "Lunch", 5.0),
                Triple("2024-01-01", "Dinner", 100.0),
                Triple("2024-01-02", "Breakfast", 5.0),
                Triple("2024-01-02", "Lunch", 5.0),
                Triple("2024-01-02", "Dinner", 100.0),
            )
        val result = computeProteinDistribution(entries)
        assertTrue(result.score < 60.0, "Expected low score for uneven distribution, got ${result.score}")
    }

    @Test
    fun emptyEntriesReturnsZero() {
        val result = computeProteinDistribution(emptyList())
        assertEquals(0.0, result.score)
        assertEquals(0.0, result.avgPerMeal)
        assertEquals(0.0, result.mealsPerDay)
        assertEquals(0, result.totalMeals)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0, result.sampleSize)
    }

    @Test
    fun singleMealPerDayHasPerfectCV() {
        val entries =
            listOf(
                Triple("2024-01-01", "Lunch", 40.0),
                Triple("2024-01-02", "Lunch", 50.0),
                Triple("2024-01-03", "Lunch", 45.0),
                Triple("2024-01-04", "Lunch", 42.0),
                Triple("2024-01-05", "Lunch", 48.0),
                Triple("2024-01-06", "Lunch", 44.0),
                Triple("2024-01-07", "Lunch", 46.0),
            )
        val result = computeProteinDistribution(entries)
        // Padded to three feedings [x, 0, 0]: the skewed pattern, not a perfect one.
        assertEquals(0.0, result.score, 1e-9)
        assertEquals(1.0, result.mealsPerDay)
    }

    @Test
    fun twoEvenMealsScoreBelowThreeEvenMeals() {
        val two = computeProteinDistribution(listOf(Triple("2024-01-01", "Lunch", 45.0), Triple("2024-01-01", "Dinner", 45.0)))
        val three =
            computeProteinDistribution(
                listOf(
                    Triple("2024-01-01", "Breakfast", 30.0),
                    Triple("2024-01-01", "Lunch", 30.0),
                    Triple("2024-01-01", "Dinner", 30.0),
                ),
            )
        assertEquals(100.0, three.score, 1e-9)
        assertTrue(two.score < three.score && two.score > 0.0)
    }

    @Test
    fun perMealThresholdScalesWithBodyWeight() {
        assertEquals(20.0, proteinPerMealThreshold(null))
        assertEquals(20.0, proteinPerMealThreshold(50.0))
        assertEquals(34.0, proteinPerMealThreshold(85.0), 1e-9)
        val result = computeProteinDistribution(listOf(Triple("2024-01-01", "Lunch", 25.0)), proteinPerMealThreshold(85.0))
        assertEquals(34.0, result.threshold, 1e-9)
        assertEquals(1, result.mealsBelowThreshold)
    }

    @Test
    fun mealsBelowThresholdCounted() {
        val entries =
            listOf(
                Triple("2024-01-01", "Breakfast", 10.0),
                Triple("2024-01-01", "Dinner", 30.0),
                Triple("2024-01-02", "Breakfast", 15.0),
                Triple("2024-01-02", "Dinner", 35.0),
                Triple("2024-01-03", "Breakfast", 8.0),
                Triple("2024-01-03", "Dinner", 40.0),
                Triple("2024-01-04", "Breakfast", 12.0),
                Triple("2024-01-04", "Dinner", 38.0),
            )
        val result = computeProteinDistribution(entries, threshold = 20.0)
        assertEquals(4, result.mealsBelowThreshold)
    }

    @Test
    fun singleEntryTotalHasOneMealPerDay() {
        val entries = listOf(Triple("2024-01-01", "lunch", 30.0))
        val result = computeProteinDistribution(entries)
        assertEquals(1, result.sampleSize)
        assertEquals(1.0, result.mealsPerDay)
        assertEquals(0.0, result.score, 1e-9)
    }

    @Test
    fun zeroProteinValuesCountedBelowThreshold() {
        val entries =
            listOf(
                Triple("2024-01-01", "breakfast", 0.0),
                Triple("2024-01-01", "lunch", 40.0),
                Triple("2024-01-01", "dinner", 0.0),
            )
        val result = computeProteinDistribution(entries)
        assertEquals(2, result.mealsBelowThreshold)
    }

    @Test
    fun customThresholdRespected() {
        val entries =
            listOf(
                Triple("2024-01-01", "breakfast", 15.0),
                Triple("2024-01-01", "lunch", 25.0),
            )
        val result10 = computeProteinDistribution(entries, threshold = 10.0)
        assertEquals(0, result10.mealsBelowThreshold)
        val result30 = computeProteinDistribution(entries, threshold = 30.0)
        assertEquals(2, result30.mealsBelowThreshold)
    }
}
