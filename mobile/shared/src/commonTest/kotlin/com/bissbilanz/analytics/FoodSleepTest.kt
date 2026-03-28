package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FoodSleepTest {
    @Test
    fun emptySleepdataReturnsEmpty() {
        val result =
            detectFoodSleepPatterns(
                eveningFoods = listOf(EveningFoodEntry("2024-01-01", "f1", "Chicken", emptyMap())),
                sleepData = emptyList(),
            )
        assertEquals(emptyList(), result.foodImpacts)
        assertEquals(0.0, result.overallAvgQuality)
    }

    @Test
    fun foodBelowMinOccurrencesExcluded() {
        val sleepData = (1..10).map { SleepQualityPoint("2024-01-%02d".format(it), 7.0) }
        // food appears only twice — below default minOccurrences=3
        val eveningFoods =
            listOf(
                EveningFoodEntry("2024-01-01", "f1", "Pizza", emptyMap()),
                EveningFoodEntry("2024-01-02", "f1", "Pizza", emptyMap()),
            )
        val result = detectFoodSleepPatterns(eveningFoods, sleepData)
        assertEquals(emptyList(), result.foodImpacts)
    }

    @Test
    fun foodWith3OccurrencesIncluded() {
        val sleepData =
            (1..10).map { i ->
                SleepQualityPoint("2024-01-%02d".format(i), if (i <= 3) 9.0 else 6.0)
            }
        val eveningFoods =
            listOf(
                EveningFoodEntry("2024-01-01", "f1", "Almonds", emptyMap()),
                EveningFoodEntry("2024-01-02", "f1", "Almonds", emptyMap()),
                EveningFoodEntry("2024-01-03", "f1", "Almonds", emptyMap()),
            )
        val result = detectFoodSleepPatterns(eveningFoods, sleepData)
        assertEquals(1, result.foodImpacts.size)
        val impact = result.foodImpacts[0]
        assertEquals("f1", impact.foodId)
        assertEquals(3, impact.occurrences)
        // avgQualityWith should be 9.0 (dates 1-3), avgQualityWithout 6.0 (dates 4-10)
        assertEquals(9.0, impact.avgQualityWith)
        assertEquals(6.0, impact.avgQualityWithout)
        assertTrue(impact.delta > 0)
    }

    @Test
    fun customMinOccurrencesRespected() {
        val sleepData = (1..10).map { SleepQualityPoint("2024-01-%02d".format(it), 7.0) }
        val eveningFoods =
            listOf(
                EveningFoodEntry("2024-01-01", "f1", "X", emptyMap()),
                EveningFoodEntry("2024-01-02", "f1", "X", emptyMap()),
                EveningFoodEntry("2024-01-03", "f1", "X", emptyMap()),
            )
        val resultExclude = detectFoodSleepPatterns(eveningFoods, sleepData, minOccurrences = 5)
        assertEquals(emptyList(), resultExclude.foodImpacts)

        val resultInclude = detectFoodSleepPatterns(eveningFoods, sleepData, minOccurrences = 2)
        assertEquals(1, resultInclude.foodImpacts.size)
    }

    @Test
    fun overallAvgQualityCalculated() {
        val sleepData =
            listOf(
                SleepQualityPoint("2024-01-01", 6.0),
                SleepQualityPoint("2024-01-02", 8.0),
                SleepQualityPoint("2024-01-03", 10.0),
            )
        val result = detectFoodSleepPatterns(emptyList(), sleepData)
        assertEquals(8.0, result.overallAvgQuality)
    }
}
