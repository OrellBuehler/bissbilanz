package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MealTimingTest {
    @Test
    fun parseLocalMinutesUtcZ() {
        val result = parseLocalMinutes("2024-01-15T08:30:00Z")
        assertEquals(8 * 60 + 30, result)
    }

    @Test
    fun parseLocalMinutesPositiveOffset() {
        // 08:30 UTC+02:00 => local 10:30 => 630 minutes
        val result = parseLocalMinutes("2024-01-15T08:30:00+02:00")
        assertEquals(10 * 60 + 30, result)
    }

    @Test
    fun parseLocalMinutesNegativeOffset() {
        // 08:30 UTC-05:00 => local 03:30 => 210 minutes
        val result = parseLocalMinutes("2024-01-15T08:30:00-05:00")
        assertEquals(3 * 60 + 30, result)
    }

    @Test
    fun parseLocalMinutesInvalidReturnsNull() {
        assertNull(parseLocalMinutes("not-a-timestamp"))
        assertNull(parseLocalMinutes("2024-01-15"))
        assertNull(parseLocalMinutes(""))
    }

    @Test
    fun parseLocalMinutesMidnightWrapAround() {
        // 23:00 UTC-02:00 => local 21:00 (same day)
        val result = parseLocalMinutes("2024-01-15T23:00:00-02:00")
        assertEquals(21 * 60, result)
    }

    @Test
    fun extractMealTimingPatternsProducesCorrectWindow() {
        val entries = listOf(
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T07:00:00Z", calories = 400.0),
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T12:30:00Z", calories = 600.0),
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T19:00:00Z", calories = 700.0),
        )
        val result = extractMealTimingPatterns(entries)
        assertEquals(1, result.dailyWindows.size)
        val window = result.dailyWindows[0]
        assertEquals("07:00", window.firstMealTime)
        assertEquals("19:00", window.lastMealTime)
        assertEquals(12 * 60, window.windowMinutes)
        assertEquals(3, window.mealCount)
        assertEquals(0, window.lateNightMeals)
    }

    @Test
    fun extractMealTimingPatternsLateNightDetection() {
        val entries = listOf(
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:00:00Z", calories = 400.0),
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T21:30:00Z", calories = 200.0),
        )
        val result = extractMealTimingPatterns(entries)
        assertEquals(1, result.dailyWindows[0].lateNightMeals)
    }

    @Test
    fun extractMealTimingPatternsEmptyEntries() {
        val result = extractMealTimingPatterns(emptyList())
        assertEquals(emptyList(), result.dailyWindows)
        assertEquals(0.0, result.avgWindowMinutes)
        assertEquals("00:00", result.avgFirstMealTime)
        assertEquals("00:00", result.avgLastMealTime)
        assertEquals(0.0, result.lateNightFrequency)
    }

    @Test
    fun extractMealTimingPatternsHourlyDistribution() {
        val entries = listOf(
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:00:00Z", calories = 400.0),
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:45:00Z", calories = 100.0),
            MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T12:00:00Z", calories = 600.0),
        )
        val result = extractMealTimingPatterns(entries)
        assertEquals(2, result.hourlyDistribution[8])
        assertEquals(1, result.hourlyDistribution[12])
        assertEquals(0, result.hourlyDistribution[9])
    }
}
