package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CorrelationTest {
    @Test
    fun perfectPositiveCorrelation() {
        val x = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0)
        val y = doubleArrayOf(2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0)
        val result = pearsonCorrelation(x, y)
        assertEquals(1.0, result.r, 1e-9)
        assertTrue(result.pValue < 0.001)
        assertEquals(10, result.sampleSize)
        assertEquals(ConfidenceLevel.LOW, result.confidence)
        assertEquals(false, result.constantInput)
    }

    @Test
    fun perfectNegativeCorrelation() {
        val x = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0)
        val y = doubleArrayOf(10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0)
        val result = pearsonCorrelation(x, y)
        assertEquals(-1.0, result.r, 1e-9)
        assertTrue(result.pValue < 0.001)
        assertEquals(false, result.constantInput)
    }

    @Test
    fun constantInputReturnsConstantFlag() {
        val x = doubleArrayOf(3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0)
        val y = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0)
        val result = pearsonCorrelation(x, y)
        assertEquals(0.0, result.r)
        assertEquals(1.0, result.pValue)
        assertEquals(true, result.constantInput)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun mismatchedLengthsThrows() {
        assertFailsWith<IllegalArgumentException> {
            pearsonCorrelation(doubleArrayOf(1.0, 2.0), doubleArrayOf(1.0, 2.0, 3.0))
        }
    }

    @Test
    fun twoElementEdgeCase() {
        val x = doubleArrayOf(1.0, 2.0)
        val y = doubleArrayOf(2.0, 4.0)
        val result = pearsonCorrelation(x, y)
        assertEquals(1.0, result.r, 1e-9)
        assertEquals(1.0, result.pValue)
        assertEquals(2, result.sampleSize)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun confidenceLevelThresholds() {
        assertEquals(ConfidenceLevel.INSUFFICIENT, getConfidenceLevel(0))
        assertEquals(ConfidenceLevel.INSUFFICIENT, getConfidenceLevel(6))
        assertEquals(ConfidenceLevel.LOW, getConfidenceLevel(7))
        assertEquals(ConfidenceLevel.LOW, getConfidenceLevel(13))
        assertEquals(ConfidenceLevel.MEDIUM, getConfidenceLevel(14))
        assertEquals(ConfidenceLevel.MEDIUM, getConfidenceLevel(29))
        assertEquals(ConfidenceLevel.HIGH, getConfidenceLevel(30))
        assertEquals(ConfidenceLevel.HIGH, getConfidenceLevel(100))
    }

    @Test
    fun highSampleSizeConfidence() {
        val n = 50
        val x = DoubleArray(n) { it.toDouble() }
        val y = DoubleArray(n) { it.toDouble() * 2 + 1 }
        val result = pearsonCorrelation(x, y)
        assertEquals(ConfidenceLevel.HIGH, result.confidence)
        assertEquals(1.0, result.r, 1e-9)
    }

    @Test
    fun rValueClampedToRange() {
        val x = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0)
        val y = doubleArrayOf(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0)
        val result = pearsonCorrelation(x, y)
        assertTrue(result.r >= -1.0)
        assertTrue(result.r <= 1.0)
    }

    @Test
    fun singleElementReturnsConstantInput() {
        val result = pearsonCorrelation(doubleArrayOf(5.0), doubleArrayOf(3.0))
        assertEquals(0.0, result.r)
        assertEquals(1.0, result.pValue)
        assertEquals(true, result.constantInput)
        assertEquals(1, result.sampleSize)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun emptyArraysReturnsConstantInput() {
        val result = pearsonCorrelation(doubleArrayOf(), doubleArrayOf())
        assertEquals(0, result.sampleSize)
        assertEquals(0.0, result.r)
        assertEquals(1.0, result.pValue)
        assertEquals(true, result.constantInput)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }
}
