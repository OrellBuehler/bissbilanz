package com.bissbilanz.analytics

import kotlinx.datetime.plus
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
        // Weight moves day over day in proportion to intake three days earlier;
        // intake is a fixed pseudo-random sequence so neighbouring lags do not
        // correlate with each other.
        val n = 30
        val lag = 3
        var seed = 42L

        fun rand(): Double {
            seed = (seed * 1664525L + 1013904223L) and 0xFFFFFFFFL
            return seed.toDouble() / 4294967296.0
        }
        val calories = (0 until n + lag).map { Pair(isoDay(it), (2000.0 + (rand() - 0.5) * 800) as Double?) }
        var w = 80.0
        val weights =
            (lag until n + lag).map { i ->
                w += (calories[i - lag].second!! - 2000.0) / 20000.0
                Pair(isoDay(i), w as Double?)
            }
        val result = computeCaloricLag(calories, weights, maxLag = 5)
        assertEquals(lag, result.bestLag)
        assertEquals(5, result.comparisons)
        val best = result.results.first { it.lag == lag }
        assertTrue(best.correlation!!.r > 0.99)
        assertTrue(best.qValue!! < 0.05)
    }

    @Test
    fun unrelatedRandomWalkYieldsNoBestLag() {
        var seed = 7L

        fun rand(): Double {
            seed = (seed * 1664525L + 1013904223L) and 0xFFFFFFFFL
            return seed.toDouble() / 4294967296.0
        }
        val calories = (0 until 40).map { Pair(isoDay(it), (2000.0 + (rand() - 0.5) * 800) as Double?) }
        var w = 80.0
        val weights =
            calories.map { (date, _) ->
                w += (rand() - 0.5) * 0.4
                Pair(date, w as Double?)
            }
        val result = computeCaloricLag(calories, weights, maxLag = 7)
        assertNull(result.bestLag)
    }

    private fun isoDay(i: Int): String =
        kotlinx.datetime
            .LocalDate(2024, 1, 1)
            .plus(i, kotlinx.datetime.DateTimeUnit.DAY)
            .toString()

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
