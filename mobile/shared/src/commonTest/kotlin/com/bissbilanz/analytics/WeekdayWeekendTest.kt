package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WeekdayWeekendTest {
    private fun entry(
        date: String,
        cal: Double,
    ) = DayEntry(
        date = date,
        calories = cal,
        protein = 100.0,
        carbs = 200.0,
        fat = 80.0,
        fiber = 25.0,
    )

    @Test
    fun weekdayWeekendSplitCorrectSign() {
        // 2024-01-01 = Monday, 2024-01-06 = Saturday, 2024-01-07 = Sunday
        val days =
            listOf(
                entry("2024-01-01", 2000.0), // Mon
                entry("2024-01-02", 2000.0), // Tue
                entry("2024-01-03", 2000.0), // Wed
                entry("2024-01-04", 2000.0), // Thu
                entry("2024-01-05", 2000.0), // Fri
                entry("2024-01-06", 2500.0), // Sat
                entry("2024-01-07", 2500.0), // Sun
            )
        val result = computeWeekdayWeekendSplit(days)
        assertEquals(2000.0, result.weekday.avgCalories)
        assertEquals(2500.0, result.weekend.avgCalories)
        assertTrue(result.calorieDelta > 0, "Weekend should have more calories than weekday")
        assertEquals(500.0, result.calorieDelta)
        assertEquals(25.0, result.calorieDeltaPct)
    }

    @Test
    fun weekdayWeekendSplitNegativeDelta() {
        val days =
            listOf(
                entry("2024-01-01", 2500.0), // Mon
                entry("2024-01-02", 2500.0), // Tue
                entry("2024-01-03", 2500.0), // Wed
                entry("2024-01-04", 2500.0), // Thu
                entry("2024-01-05", 2500.0), // Fri
                entry("2024-01-06", 1800.0), // Sat
                entry("2024-01-07", 1800.0), // Sun
            )
        val result = computeWeekdayWeekendSplit(days)
        assertTrue(result.calorieDelta < 0, "Weekend should have fewer calories than weekday")
    }

    @Test
    fun emptyDatasetReturnsZero() {
        val result = computeWeekdayWeekendSplit(emptyList())
        assertEquals(0.0, result.weekday.avgCalories)
        assertEquals(0.0, result.weekend.avgCalories)
        assertEquals(0.0, result.calorieDelta)
        assertEquals(0.0, result.calorieDeltaPct)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
        assertEquals(0, result.sampleSize)
    }

    @Test
    fun weekdayOnlyData() {
        val days =
            listOf(
                entry("2024-01-01", 2000.0), // Mon
                entry("2024-01-02", 2100.0), // Tue
                entry("2024-01-03", 1900.0), // Wed
            )
        val result = computeWeekdayWeekendSplit(days)
        assertEquals(3, result.weekday.days)
        assertEquals(0, result.weekend.days)
        assertEquals(0.0, result.weekend.avgCalories)
    }

    @Test
    fun macroAveragesCalculatedCorrectly() {
        val days =
            listOf(
                DayEntry("2024-01-01", 2000.0, 150.0, 250.0, 70.0, 30.0), // Mon
                DayEntry("2024-01-02", 2000.0, 150.0, 250.0, 70.0, 30.0), // Tue
                DayEntry("2024-01-06", 2500.0, 100.0, 300.0, 90.0, 20.0), // Sat
                DayEntry("2024-01-07", 2500.0, 100.0, 300.0, 90.0, 20.0), // Sun
            )
        val result = computeWeekdayWeekendSplit(days)
        assertEquals(150.0, result.weekday.avgProtein)
        assertEquals(100.0, result.weekend.avgProtein)
    }
}
