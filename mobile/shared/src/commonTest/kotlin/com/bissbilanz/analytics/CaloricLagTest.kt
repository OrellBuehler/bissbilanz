package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

class CaloricLagTest {
    private fun makeSeries(
        dates: List<String>,
        values: List<Double?>,
    ): List<Pair<String, Double?>> = dates.zip(values)

    @Test
    fun insufficientPairsReturnsNullCorrelation() {
        val calDates = (1..5).map { "2024-01-${pad2(it)}" }
        val wtDates = (1..5).map { "2024-01-${pad2(it)}" }
        val calories = makeSeries(calDates, (1..5).map { 2000.0 })
        val weights = makeSeries(wtDates, (1..5).map { 80.0 })
        val result = computeCaloricLag(calories, weights, maxLag = 3)
        for (r in result.results) {
            assertNull(r.correlation)
        }
        assertNull(result.bestLag)
    }

    @Test
    fun clearLagPatternSelectsBestLag() {
        val n = 30
        val calDates = (1..n).map { "2024-01-${pad2(it)}" }
        val wtDates =
            (3..(n + 2)).map {
                val month = if (it <= 31) "2024-01" else "2024-02"
                val day = if (it <= 31) it else it - 31
                "$month-${pad2(day)}"
            }
        val baseCalories = (1..n).map { if (it % 5 == 0) 3000.0 else 1800.0 }
        val calories = makeSeries(calDates, baseCalories.map { it })
        val shiftedWeights =
            (1..n).map { i ->
                val calIdx = i - 3
                if (calIdx >= 0) 75.0 + (baseCalories[calIdx] - 1800.0) / 7700.0 else 75.0
            }
        val weights = makeSeries(wtDates.take(n), shiftedWeights)
        val result = computeCaloricLag(calories, weights, maxLag = 5)
        assertNotNull(result.bestLag)
    }

    @Test
    fun allResultsHaveLagValues() {
        val n = 20
        val dates = (1..n).map { "2024-01-${pad2(it)}" }
        val calories = makeSeries(dates, (1..n).map { 2000.0 })
        val weights = makeSeries(dates, (1..n).map { 80.0 - it * 0.05 })
        val maxLag = 5
        val result = computeCaloricLag(calories, weights, maxLag = maxLag)
        assertEquals(maxLag, result.results.size)
        for (i in 0 until maxLag) {
            assertEquals(i + 1, result.results[i].lag)
        }
    }

    @Test
    fun bestLagHasHighestAbsCorrelation() {
        val n = 20
        val dates = (1..n).map { "2024-01-${pad2(it)}" }
        val calories = makeSeries(dates, (1..n).map { it.toDouble() * 100 + 1500 })
        val weights = makeSeries(dates, (1..n).map { 80.0 - it * 0.1 })
        val result = computeCaloricLag(calories, weights, maxLag = 3)
        val best = result.bestLag
        if (best != null) {
            val bestCorr = result.results.first { it.lag == best }.correlation
            assertNotNull(bestCorr)
            for (r in result.results) {
                if (r.correlation != null) {
                    assertTrue(abs(r.correlation.r) <= abs(bestCorr.r) + 1e-9)
                }
            }
        }
    }

    @Test
    fun emptyCaloriesReturnsAllNullCorrelations() {
        val weight = (1..10).map { Pair("2024-01-${pad2(it)}", 80.0 as Double?) }
        val result = computeCaloricLag(emptyList(), weight)
        assertEquals(7, result.results.size)
        assertNull(result.bestLag)
        for (r in result.results) assertNull(r.correlation)
    }

    @Test
    fun emptyWeightReturnsAllNullCorrelations() {
        val calories = (1..10).map { Pair("2024-01-${pad2(it)}", 2000.0 as Double?) }
        val result = computeCaloricLag(calories, emptyList())
        assertEquals(7, result.results.size)
        assertNull(result.bestLag)
    }

    @Test
    fun allNullCaloriesReturnsAllNullCorrelations() {
        val calories = (1..10).map { Pair("2024-01-${pad2(it)}", null as Double?) }
        val weight = (1..10).map { Pair("2024-01-${pad2(it)}", 80.0 as Double?) }
        val result = computeCaloricLag(calories, weight)
        assertNull(result.bestLag)
    }

    @Test
    fun maxLagOneReturnsSingleResult() {
        val calories = (1..10).map { Pair("2024-01-${pad2(it)}", 2000.0 as Double?) }
        val weight = (1..10).map { Pair("2024-01-${pad2(it)}", 80.0 as Double?) }
        val result = computeCaloricLag(calories, weight, maxLag = 1)
        assertEquals(1, result.results.size)
        assertEquals(1, result.results[0].lag)
    }
}
