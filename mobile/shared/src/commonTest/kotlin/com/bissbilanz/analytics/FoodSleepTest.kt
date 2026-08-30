package com.bissbilanz.analytics

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FoodSleepTest {
    private fun isoDay(i: Int): String = LocalDate(2024, 1, 1).plus(i, DateTimeUnit.DAY).toString()

    /**
     * 40 nights. Chamomile on every 4th night lifts quality to ~8.5, coffee on
     * every 4th+2 night drops it to ~4.5, the rest sit at ~6.5 with a little
     * alternating noise so the variances are non-zero.
     */
    private val sleepData =
        (0 until 40).map { i ->
            val base =
                if (i % 4 == 0) {
                    8.5
                } else if (i % 4 == 2) {
                    4.5
                } else {
                    6.5
                }
            SleepQualityPoint(isoDay(i), base + if (i % 2 == 0) 0.2 else -0.2)
        }
    private val chamomile =
        sleepData.filterIndexed { i, _ -> i % 4 == 0 }.map { EveningFoodEntry(it.date, "f1", "Chamomile", emptyMap()) }
    private val coffee =
        sleepData.filterIndexed { i, _ -> i % 4 == 2 }.map { EveningFoodEntry(it.date, "f2", "Coffee", emptyMap()) }
    private val toast =
        sleepData.filterIndexed { i, _ -> i % 5 == 1 }.map { EveningFoodEntry(it.date, "f3", "Toast", emptyMap()) }

    @Test
    fun emptySleepdataReturnsEmpty() {
        val result =
            detectFoodSleepPatterns(
                eveningFoods = listOf(EveningFoodEntry("2024-01-01", "f1", "Chicken", emptyMap())),
                sleepData = emptyList(),
            )
        assertEquals(emptyList(), result.foodImpacts)
        assertEquals(0.0, result.overallAvgQuality)
        assertEquals(0, result.comparisons)
    }

    @Test
    fun foodBelowMinOccurrencesExcluded() {
        val result = detectFoodSleepPatterns(chamomile.take(4), sleepData)
        assertEquals(emptyList(), result.foodImpacts)
        assertEquals(0, result.comparisons)
    }

    @Test
    fun foodAtMinOccurrencesIncludedWhenTheEffectIsReal() {
        val result = detectFoodSleepPatterns(chamomile.take(5), sleepData)
        assertEquals(1, result.foodImpacts.size)
        val impact = result.foodImpacts[0]
        assertEquals("f1", impact.foodId)
        assertEquals(5, impact.occurrences)
        assertTrue(impact.delta > 0)
        assertTrue(impact.qValue <= 0.1)
    }

    @Test
    fun negativeEffectDetected() {
        val result = detectFoodSleepPatterns(coffee, sleepData)
        assertEquals(1, result.foodImpacts.size)
        assertTrue(result.foodImpacts[0].delta < 0)
    }

    @Test
    fun foodWithinNoiseDoesNotSurface() {
        val result = detectFoodSleepPatterns(chamomile + coffee + toast, sleepData)
        assertEquals(3, result.comparisons)
        assertEquals(setOf("f1", "f2"), result.foodImpacts.map { it.foodId }.toSet())
    }

    @Test
    fun customMinOccurrencesRespected() {
        val resultExclude = detectFoodSleepPatterns(chamomile.take(6), sleepData, minOccurrences = 8)
        assertEquals(emptyList(), resultExclude.foodImpacts)
        val resultInclude = detectFoodSleepPatterns(chamomile.take(6), sleepData, minOccurrences = 6)
        assertEquals(1, resultInclude.foodImpacts.size)
    }

    @Test
    fun overallAvgQualityCalculated() {
        val sleep =
            listOf(
                SleepQualityPoint("2024-01-01", 6.0),
                SleepQualityPoint("2024-01-02", 8.0),
                SleepQualityPoint("2024-01-03", 10.0),
            )
        val result = detectFoodSleepPatterns(emptyList(), sleep)
        assertEquals(8.0, result.overallAvgQuality)
    }

    @Test
    fun sortedByAbsoluteDelta() {
        val result = detectFoodSleepPatterns(chamomile + coffee, sleepData)
        for (i in 0 until result.foodImpacts.size - 1) {
            assertTrue(kotlin.math.abs(result.foodImpacts[i].delta) >= kotlin.math.abs(result.foodImpacts[i + 1].delta))
        }
    }

    @Test
    fun foodWithZeroDeltaIsNotSurfaced() {
        val uniform = sleepData.map { SleepQualityPoint(it.date, 7.0) }
        val result = detectFoodSleepPatterns(chamomile, uniform)
        assertEquals(0, result.foodImpacts.size)
        assertEquals(1, result.comparisons)
    }

    @Test
    fun foodsOnDatesWithoutSleepDataExcluded() {
        val foods = (10..16).map { EveningFoodEntry("2025-06-$it", "f1", "Pizza", mapOf()) }
        val sleep = listOf(SleepQualityPoint("2024-01-01", 7.0))
        val result = detectFoodSleepPatterns(foods, sleep)
        assertEquals(0, result.foodImpacts.size)
    }
}
