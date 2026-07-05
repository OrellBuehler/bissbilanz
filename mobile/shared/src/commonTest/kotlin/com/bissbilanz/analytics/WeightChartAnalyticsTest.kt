package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WeightChartAnalyticsTest {
    @Test
    fun averagesOverTrailingCalendarDaysNotRows() {
        val entries =
            listOf(
                WeightChartInput(date = "2025-02-01", weightKg = 82.4),
                WeightChartInput(date = "2025-02-03", weightKg = 82.1),
                WeightChartInput(date = "2025-02-06", weightKg = 81.9),
                WeightChartInput(date = "2025-02-20", weightKg = 81.2),
                WeightChartInput(date = "2025-02-22", weightKg = 81.0),
            )
        val result = weightMovingAverage(entries, 7)
        assertEquals(
            listOf("2025-02-01", "2025-02-03", "2025-02-06", "2025-02-20", "2025-02-22"),
            result.map { it.date },
        )
        assertEquals(82.4, result[0].movingAvg, 1e-9)
        assertEquals((82.4 + 82.1) / 2, result[1].movingAvg, 1e-9)
        assertEquals((82.4 + 82.1 + 81.9) / 3, result[2].movingAvg, 1e-9)
        assertEquals(81.2, result[3].movingAvg, 1e-9)
        assertEquals((81.2 + 81.0) / 2, result[4].movingAvg, 1e-9)
    }

    @Test
    fun collapsesSameDateToLatestLoggedAt() {
        val entries =
            listOf(
                WeightChartInput(date = "2025-03-01", weightKg = 80.2, loggedAt = "2025-03-01T06:30:00Z"),
                WeightChartInput(date = "2025-03-01", weightKg = 80.6, loggedAt = "2025-03-01T21:40:00Z"),
                WeightChartInput(date = "2025-03-02", weightKg = 79.8, loggedAt = "2025-03-02T07:10:00Z"),
                WeightChartInput(date = "2025-03-02", weightKg = 79.4, loggedAt = null),
            )
        val result = weightMovingAverage(entries, 7)
        assertEquals(2, result.size)
        assertEquals(80.6, result[0].weightKg, 1e-9)
        assertEquals(79.8, result[1].weightKg, 1e-9)
    }

    @Test
    fun sortsInputAndSkipsUnparseableDates() {
        val entries =
            listOf(
                WeightChartInput(date = "2025-04-03", weightKg = 78.0),
                WeightChartInput(date = "garbage", weightKg = 99.9),
                WeightChartInput(date = "2025-04-01", weightKg = 79.0),
            )
        val result = weightMovingAverage(entries, 7)
        assertEquals(listOf("2025-04-01", "2025-04-03"), result.map { it.date })
        assertEquals(78.5, result[1].movingAvg, 1e-9)
    }

    @Test
    fun emptyInputYieldsEmptyOutput() {
        assertTrue(weightMovingAverage(emptyList(), 7).isEmpty())
    }
}
