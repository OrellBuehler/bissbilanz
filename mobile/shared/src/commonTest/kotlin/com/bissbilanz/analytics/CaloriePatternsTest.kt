package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CaloriePatternsTest {
    @Test
    fun frontLoadingMorningHeavy() {
        val entries =
            listOf(
                Triple("2024-01-01", "2024-01-01T07:00:00Z", 600.0),
                Triple("2024-01-01", "2024-01-01T10:00:00Z", 400.0),
                Triple("2024-01-01", "2024-01-01T19:00:00Z", 200.0),
                Triple("2024-01-02", "2024-01-02T08:00:00Z", 500.0),
                Triple("2024-01-02", "2024-01-02T11:00:00Z", 400.0),
                Triple("2024-01-02", "2024-01-02T20:00:00Z", 100.0),
            )
        val result = computeCalorieFrontLoading(entries)
        assertTrue(result.avgMorningPct > 50.0, "Expected morning-heavy loading, got ${result.avgMorningPct}")
        assertEquals(2, result.daysAbove50Pct)
        assertEquals(2, result.totalDays)
    }

    @Test
    fun frontLoadingEmptyReturnsZero() {
        val result = computeCalorieFrontLoading(emptyList())
        assertEquals(0.0, result.avgMorningPct)
        assertEquals(0, result.daysAbove50Pct)
        assertEquals(0, result.totalDays)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun frontLoadingSkipsNullEatenAt() {
        val entries =
            listOf(
                Triple<String, String?, Double>("2024-01-01", null, 500.0),
                Triple<String, String?, Double>("2024-01-02", "2024-01-02T08:00:00Z", 800.0),
            )
        val result = computeCalorieFrontLoading(entries)
        assertEquals(1, result.totalDays)
    }

    @Test
    fun cyclingConsistentPattern() {
        val days =
            (1..14).map { i ->
                Pair("2024-01-${i.toString().padStart(2, '0')}", 2000.0 + i * 10.0)
            }
        val result = computeCalorieCycling(days)
        assertEquals("consistent", result.pattern, "CV=${result.cv} should be consistent (<15)")
    }

    @Test
    fun cyclingHighVariancePattern() {
        val days =
            listOf(
                Pair("2024-01-01", 1000.0),
                Pair("2024-01-02", 3000.0),
                Pair("2024-01-03", 800.0),
                Pair("2024-01-04", 3500.0),
                Pair("2024-01-05", 900.0),
                Pair("2024-01-06", 3200.0),
                Pair("2024-01-07", 1100.0),
            )
        val result = computeCalorieCycling(days)
        assertEquals("high_variance", result.pattern, "Expected high variance, CV=${result.cv}")
        assertTrue(result.cv > 30.0)
    }

    @Test
    fun cyclingModeratePattern() {
        // mean=2000, values spread so CV is in 15-30% range
        // deviations: -500,500,-400,400,-300,300 → mean of 6 values=2000, variance=175000, stddev=418, CV=20.9%
        val days =
            listOf(
                Pair("2024-01-01", 1500.0),
                Pair("2024-01-02", 2500.0),
                Pair("2024-01-03", 1600.0),
                Pair("2024-01-04", 2400.0),
                Pair("2024-01-05", 1700.0),
                Pair("2024-01-06", 2300.0),
            )
        val result = computeCalorieCycling(days)
        assertEquals("moderate", result.pattern, "CV=${result.cv} should be moderate (15-30)")
        assertTrue(result.cv >= 15.0 && result.cv < 30.0)
    }

    @Test
    fun cyclingEmptyReturnsZero() {
        val result = computeCalorieCycling(emptyList())
        assertEquals(0.0, result.mean)
        assertEquals(0.0, result.stddev)
        assertEquals(0.0, result.cv)
        assertEquals("consistent", result.pattern)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }
}
