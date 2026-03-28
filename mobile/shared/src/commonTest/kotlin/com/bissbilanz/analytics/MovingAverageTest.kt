package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MovingAverageTest {
    @Test
    fun basicWindowOfThree() {
        val series = listOf(1.0, 2.0, 3.0, 4.0, 5.0)
        val result = movingAverage(series, 3)
        assertNull(result[0])
        assertNull(result[1])
        assertEquals(2.0, result[2]!!, 1e-9)
        assertEquals(3.0, result[3]!!, 1e-9)
        assertEquals(4.0, result[4]!!, 1e-9)
    }

    @Test
    fun windowOfOne() {
        val series = listOf(1.0, 2.0, 3.0)
        val result = movingAverage(series, 1)
        assertEquals(1.0, result[0]!!, 1e-9)
        assertEquals(2.0, result[1]!!, 1e-9)
        assertEquals(3.0, result[2]!!, 1e-9)
    }

    @Test
    fun nullElementsSkippedInAverage() {
        val series = listOf(1.0, null, 3.0, 4.0, 5.0)
        val result = movingAverage(series, 3)
        assertNull(result[0])
        assertNull(result[1])
        assertEquals(2.0, result[2]!!, 1e-9)
        assertEquals(3.5, result[3]!!, 1e-9)
        assertEquals(4.0, result[4]!!, 1e-9)
    }

    @Test
    fun allNullWindowReturnsNull() {
        val series = listOf<Double?>(null, null, null, 4.0, 5.0)
        val result = movingAverage(series, 3)
        assertNull(result[0])
        assertNull(result[1])
        assertNull(result[2])
        assertEquals(4.0, result[3]!!, 1e-9)
        assertEquals(4.5, result[4]!!, 1e-9)
    }

    @Test
    fun emptySeriesReturnsEmpty() {
        val result = movingAverage(emptyList(), 3)
        assertEquals(0, result.size)
    }

    @Test
    fun resultSizeMatchesInput() {
        val series = listOf(1.0, 2.0, 3.0, 4.0, 5.0)
        val result = movingAverage(series, 3)
        assertEquals(series.size, result.size)
    }

    @Test
    fun windowLargerThanSeriesAllNull() {
        val series = listOf(1.0, 2.0)
        val result = movingAverage(series, 5)
        assertNull(result[0])
        assertNull(result[1])
    }
}
