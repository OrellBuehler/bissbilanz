package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

class SodiumWeightTest {
    private fun makeNutrients(
        dates: List<String>,
        sodiumValues: List<Double>,
    ): List<Pair<String, Double>> = dates.zip(sodiumValues)

    private fun makeWeights(
        dates: List<String>,
        values: List<Double?>,
    ): List<Pair<String, Double?>> = dates.zip(values)

    @Test
    fun sufficientPairsReturnsCorrelation() {
        val dates = (1..15).map { "2024-01-${pad2(it)}" }
        val nutrients = makeNutrients(dates, (1..15).map { 2000.0 + it * 100.0 })
        val weightDates = (1..16).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(weightDates, (1..16).map { 75.0 + it * 0.02 })
        val result = computeSodiumWeightCorrelation(nutrients, weights)
        assertTrue(result.confidence != ConfidenceLevel.INSUFFICIENT)
        assertNotNull(result.correlation.pValue)
        assertTrue(result.sampleSize >= 7)
    }

    @Test
    fun fewerThanSevenPairsReturnsInsufficient() {
        val dates = (1..5).map { "2024-01-${pad2(it)}" }
        val nutrients = makeNutrients(dates, (1..5).map { 2000.0 })
        val weightDates = (1..6).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(weightDates, (1..6).map { 75.0 })
        val result = computeSodiumWeightCorrelation(nutrients, weights)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0.0, result.correlation.r)
        assertNull(result.correlation.pValue)
    }

    @Test
    fun highSodiumDaysCountedCorrectly() {
        val dates = (1..15).map { "2024-01-${pad2(it)}" }
        val sodiumValues = (1..15).map { if (it <= 5) 3000.0 else 1500.0 }
        val nutrients = makeNutrients(dates, sodiumValues)
        val weightDates = (1..16).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(weightDates, (1..16).map { 75.0 })
        val result = computeSodiumWeightCorrelation(nutrients, weights)
        assertEquals(5, result.highSodiumDays)
    }

    @Test
    fun avgSodiumCalculatedFromAllEntries() {
        val dates = (1..10).map { "2024-01-${pad2(it)}" }
        val sodiumValues = (1..10).map { 2000.0 }
        val nutrients = makeNutrients(dates, sodiumValues)
        val weightDates = (1..11).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(weightDates, (1..11).map { 75.0 })
        val result = computeSodiumWeightCorrelation(nutrients, weights)
        assertEquals(2000.0, result.avgSodium, 1e-9)
    }

    @Test
    fun avgWeightDeltaAfterHighSodiumIsNull_whenNoHighDays() {
        val dates = (1..10).map { "2024-01-${pad2(it)}" }
        val sodiumValues = (1..10).map { 1000.0 }
        val nutrients = makeNutrients(dates, sodiumValues)
        val weightDates = (1..11).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(weightDates, (1..11).map { 75.0 })
        val result = computeSodiumWeightCorrelation(nutrients, weights)
        assertNull(result.avgWeightDeltaAfterHighSodium)
        assertEquals(0, result.highSodiumDays)
    }

    @Test
    fun emptyNutrientsReturnsInsufficient() {
        val weights = makeWeights(listOf("2024-01-01", "2024-01-02"), listOf(75.0, 75.1))
        val result = computeSodiumWeightCorrelation(emptyList(), weights)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0.0, result.avgSodium, 1e-9)
    }
}
