package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CaloricLagTest {
    private fun makeSeries(
        dates: List<String>,
        values: List<Double?>,
    ): List<Pair<String, Double?>> = dates.zip(values)

    @Test
    fun insufficientPairsReturnsNullCorrelation() {
        val calDates = (1..5).map { "2024-01-%02d".format(it) }
        val wtDates = (1..5).map { "2024-01-%02d".format(it) }
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
        val calDates = (1..n).map { "2024-01-%02d".format(it) }
        val wtDates =
            (3..(n + 2)).map {
                val month = if (it <= 31) "2024-01" else "2024-02"
                val day = if (it <= 31) it else it - 31
                "%s-%02d".format(month, day)
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
        val dates = (1..n).map { "2024-01-%02d".format(it) }
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
        val dates = (1..n).map { "2024-01-%02d".format(it) }
        val calories = makeSeries(dates, (1..n).map { it.toDouble() * 100 + 1500 })
        val weights = makeSeries(dates, (1..n).map { 80.0 - it * 0.1 })
        val result = computeCaloricLag(calories, weights, maxLag = 3)
        val best = result.bestLag
        if (best != null) {
            val bestCorr = result.results.first { it.lag == best }.correlation
            assertNotNull(bestCorr)
            for (r in result.results) {
                if (r.correlation != null) {
                    assert(Math.abs(r.correlation.r) <= Math.abs(bestCorr.r) + 1e-9)
                }
            }
        }
    }
}
