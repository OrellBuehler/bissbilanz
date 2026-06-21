package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MealTimingTest {
    @Test
    fun localMinutesOfDayUtcZ() {
        val result = localMinutesOfDay("2024-01-15T08:30:00Z", "UTC")
        assertEquals(8 * 60 + 30, result)
    }

    @Test
    fun localMinutesOfDayConvertsToZone() {
        // 08:30Z rendered in Europe/Zurich (winter, UTC+1) => 09:30 => 570 minutes
        val result = localMinutesOfDay("2024-01-15T08:30:00Z", "Europe/Zurich")
        assertEquals(9 * 60 + 30, result)
    }

    @Test
    fun localMinutesOfDayBehindUtc() {
        // 08:30Z rendered in America/New_York (winter, UTC-5) => 03:30 => 210 minutes
        val result = localMinutesOfDay("2024-01-15T08:30:00Z", "America/New_York")
        assertEquals(3 * 60 + 30, result)
    }

    @Test
    fun localMinutesOfDayNormalizesOffsetToInstant() {
        // 08:30+02:00 is 06:30Z; in UTC that buckets to 06:30 => 390 minutes
        val result = localMinutesOfDay("2024-01-15T08:30:00+02:00", "UTC")
        assertEquals(6 * 60 + 30, result)
    }

    @Test
    fun localMinutesOfDayInvalidReturnsNull() {
        assertNull(localMinutesOfDay("not-a-timestamp", "UTC"))
        assertNull(localMinutesOfDay("2024-01-15", "UTC"))
        assertNull(localMinutesOfDay("", "UTC"))
    }

    @Test
    fun localMinutesOfDayInvalidZoneReturnsNull() {
        assertNull(localMinutesOfDay("2024-01-15T08:30:00Z", "Not/AZone"))
    }

    @Test
    fun localMinutesOfDayWrapsToNextLocalDay() {
        // 23:00Z rendered in Europe/Zurich (UTC+1) => 00:00 the next local day => 0 minutes
        val result = localMinutesOfDay("2024-01-15T23:00:00Z", "Europe/Zurich")
        assertEquals(0, result)
    }

    @Test
    fun extractMealTimingPatternsProducesCorrectWindow() {
        val entries =
            listOf(
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T07:00:00Z", calories = 400.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T12:30:00Z", calories = 600.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T19:00:00Z", calories = 700.0),
            )
        val result = extractMealTimingPatterns(entries, "UTC")
        assertEquals(1, result.dailyWindows.size)
        val window = result.dailyWindows[0]
        assertEquals("07:00", window.firstMealTime)
        assertEquals("19:00", window.lastMealTime)
        assertEquals(12 * 60, window.windowMinutes)
        assertEquals(3, window.mealCount)
        assertEquals(0, window.lateNightMeals)
    }

    @Test
    fun extractMealTimingPatternsBucketsIntoZone() {
        // Same instants as above shifted into Europe/Zurich (winter, UTC+1).
        val entries =
            listOf(
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T07:00:00Z", calories = 400.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T19:00:00Z", calories = 700.0),
            )
        val result = extractMealTimingPatterns(entries, "Europe/Zurich")
        val window = result.dailyWindows[0]
        assertEquals("08:00", window.firstMealTime)
        assertEquals("20:00", window.lastMealTime)
    }

    @Test
    fun extractMealTimingPatternsLateNightDetection() {
        val entries =
            listOf(
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:00:00Z", calories = 400.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T21:30:00Z", calories = 200.0),
            )
        val result = extractMealTimingPatterns(entries, "UTC")
        assertEquals(1, result.dailyWindows[0].lateNightMeals)
    }

    @Test
    fun extractMealTimingPatternsEmptyEntries() {
        val result = extractMealTimingPatterns(emptyList(), "UTC")
        assertEquals(emptyList(), result.dailyWindows)
        assertEquals(0.0, result.avgWindowMinutes)
        assertEquals("00:00", result.avgFirstMealTime)
        assertEquals("00:00", result.avgLastMealTime)
        assertEquals(0.0, result.lateNightFrequency)
    }

    @Test
    fun extractMealTimingPatternsHourlyDistribution() {
        val entries =
            listOf(
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:00:00Z", calories = 400.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:45:00Z", calories = 100.0),
                MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T12:00:00Z", calories = 600.0),
            )
        val result = extractMealTimingPatterns(entries, "UTC")
        assertEquals(2, result.hourlyDistribution[8])
        assertEquals(1, result.hourlyDistribution[12])
        assertEquals(0, result.hourlyDistribution[9])
    }

    @Test
    fun singleMealEntryProducesOneWindow() {
        val entries = listOf(MealEntry(date = "2024-01-01", eatenAt = "2024-01-01T12:00:00Z", calories = 500.0))
        val result = extractMealTimingPatterns(entries, "UTC")
        assertEquals(1, result.dailyWindows.size)
        assertEquals(1, result.dailyWindows[0].mealCount)
        assertEquals(0, result.dailyWindows[0].windowMinutes)
    }

    @Test
    fun allNullEatenAtReturnsEmpty() {
        val entries =
            listOf(
                MealEntry(date = "2024-01-01", eatenAt = null, calories = 500.0),
                MealEntry(date = "2024-01-02", eatenAt = null, calories = 400.0),
            )
        val result = extractMealTimingPatterns(entries, "UTC")
        assertEquals(0, result.dailyWindows.size)
    }

    @Test
    fun localMinutesOfDayMidnightExact() {
        val result = localMinutesOfDay("2024-01-01T00:00:00Z", "UTC")
        assertEquals(0, result)
    }

    @Test
    fun localMinutesOfDayEndOfDay() {
        val result = localMinutesOfDay("2024-01-01T23:59:00Z", "UTC")
        assertEquals(23 * 60 + 59, result)
    }

    @Test
    fun localMinutesOfDayWithSeconds() {
        val result = localMinutesOfDay("2024-01-01T08:30:45Z", "UTC")
        assertEquals(8 * 60 + 30, result)
    }
}
