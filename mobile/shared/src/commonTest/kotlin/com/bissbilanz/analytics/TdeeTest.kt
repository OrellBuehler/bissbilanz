package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

class TdeeTest {
    private fun makeWeights(
        dates: List<String>,
        values: List<Double?>,
    ): List<Pair<String, Double?>> = dates.zip(values)

    private fun makeCalories(
        dates: List<String>,
        values: List<Double?>,
    ): List<Pair<String, Double?>> = dates.zip(values)

    @Test
    fun sufficientDataReturnsNonNullTDEE() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..20).map { 80.0 - it * 0.05 })
        val calories = makeCalories(dates, (1..20).map { 2000.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertNotNull(result.estimatedTDEE)
        assertTrue(result.estimatedTDEE!! > 1200)
        assertTrue(result.estimatedTDEE < 5000)
    }

    @Test
    fun insufficientWeightsReturnsNullTDEE() {
        val dates = (1..14).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates.take(4), (1..4).map { 80.0 })
        val calories = makeCalories(dates, (1..14).map { 2000.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertNull(result.estimatedTDEE)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun insufficientCaloriesReturnsNullTDEE() {
        val dates = (1..14).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..14).map { 80.0 })
        val calories = makeCalories(dates.take(9), (1..9).map { 2000.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertNull(result.estimatedTDEE)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun trendClassifiedAsLoss() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..20).map { 80.0 - it * 0.2 })
        val calories = makeCalories(dates, (1..20).map { 1800.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertEquals("loss", result.trend)
        assertTrue(result.weeklyRate < -0.05)
    }

    @Test
    fun trendClassifiedAsGain() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..20).map { 70.0 + it * 0.2 })
        val calories = makeCalories(dates, (1..20).map { 3000.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertEquals("gain", result.trend)
        assertTrue(result.weeklyRate > 0.05)
    }

    @Test
    fun trendClassifiedAsMaintenance() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..20).map { 75.0 })
        val calories = makeCalories(dates, (1..20).map { 2200.0 })
        val result = computeAdaptiveTDEE(weights, calories)
        assertEquals("maintenance", result.trend)
    }

    @Test
    fun plateauDetectionWithFlatSeries() {
        val dates = (1..14).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..14).map { 75.0 })
        val calories = makeCalories(dates, (1..14).map { 1900.0 })
        val result = detectPlateau(weights, calories, estimatedTDEE = 2200.0)
        assertTrue(result.isPlateaued)
        assertEquals(14, result.plateauDays)
        assertEquals("adaptive_metabolism", result.cause)
    }

    @Test
    fun plateauNotDetectedWithSteepSlope() {
        val dates = (1..14).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..14).map { 80.0 - it * 0.3 })
        val calories = makeCalories(dates, (1..14).map { 1600.0 })
        val result = detectPlateau(weights, calories, estimatedTDEE = 2200.0)
        assertTrue(!result.isPlateaued)
    }

    @Test
    fun plateauCauseHighSodium() {
        val dates = (1..14).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..14).map { 75.0 })
        val calories = makeCalories(dates, (1..14).map { 2200.0 })
        val result = detectPlateau(weights, calories, estimatedTDEE = 2200.0, sodiumAvg = 3500.0)
        assertTrue(result.isPlateaued)
        assertEquals("water_retention", result.cause)
    }

    @Test
    fun insufficientDataForPlateauReturnsNotPlateaued() {
        val dates = listOf("2024-01-01", "2024-01-02")
        val weights = makeWeights(dates, listOf(75.0, 75.0))
        val calories = makeCalories(dates, listOf(2000.0, 2000.0))
        val result = detectPlateau(weights, calories, estimatedTDEE = 2200.0)
        assertTrue(!result.isPlateaued)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun weightForecastProjections() {
        val dates = (1..25).map { "2024-01-${pad2(it)}" }
        val weights = makeWeights(dates, (1..25).map { 80.0 - it * 0.1 })
        val result = projectWeight(weights, weeklyRate = -0.5)
        assertNotNull(result.currentWeight)
        assertNotNull(result.day30)
        assertNotNull(result.day60)
        assertNotNull(result.day90)
        assertTrue(result.day30!! < result.currentWeight!!)
        assertTrue(result.day60!! < result.day30)
        assertTrue(result.day90!! < result.day60)
        assertEquals(ConfidenceLevel.HIGH, result.confidence)
    }

    @Test
    fun weightForecastEmptySeriesReturnsNullCurrentWeight() {
        val result = projectWeight(emptyList(), weeklyRate = -0.5)
        assertNull(result.currentWeight)
        assertNull(result.day30)
        assertNull(result.day60)
        assertNull(result.day90)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun weightSeriesWithNullsMixedIn() {
        val weights = (1..20).map { Pair("2024-01-${pad2(it)}", if (it % 3 == 0) null else 80.0 - it * 0.1) }
        val calories = (1..20).map { Pair("2024-01-${pad2(it)}", 2000.0 as Double?) }
        val result = computeAdaptiveTDEE(weights, calories)
        assertTrue(result.sampleSize > 0)
    }

    @Test
    fun singleWeightEntryReturnsInsufficient() {
        val weights = listOf(Pair("2024-01-15", 80.0 as Double?))
        val calories = (1..15).map { Pair("2024-01-${pad2(it)}", 2000.0 as Double?) }
        val result = computeAdaptiveTDEE(weights, calories)
        assertNull(result.estimatedTDEE)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun emptyWeightAndCaloriesReturnsInsufficient() {
        val result = computeAdaptiveTDEE(emptyList(), emptyList())
        assertNull(result.estimatedTDEE)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0.0, result.avgIntake)
    }

    @Test
    fun projectWeightSingleEntry() {
        val weights = listOf(Pair("2024-01-01", 80.0 as Double?))
        val result = projectWeight(weights, -0.5)
        assertEquals(80.0, result.currentWeight)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertNotNull(result.day30)
    }

    @Test
    fun plateauDetectionSingleWeightReturnsNotPlateaued() {
        val weights = listOf(Pair("2024-01-15", 80.0 as Double?))
        val calories = listOf(Pair("2024-01-15", 2000.0 as Double?))
        val result = detectPlateau(weights, calories, 2000.0)
        assertEquals(false, result.isPlateaued)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }
}
