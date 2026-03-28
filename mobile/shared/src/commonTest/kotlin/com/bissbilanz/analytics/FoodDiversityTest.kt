package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals

class FoodDiversityTest {
    @Test
    fun weeklyBucketingGroupsByMonday() {
        // 2024-01-01 = Monday, 2024-01-03 = Wednesday (same week)
        // 2024-01-08 = Monday (next week)
        val entries =
            listOf(
                FoodEntry("2024-01-01", "food1", null, "Apple"),
                FoodEntry("2024-01-03", "food2", null, "Banana"),
                FoodEntry("2024-01-08", "food3", null, "Cherry"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals(2, result.weeklyEntries.size)
        assertEquals("2024-01-01", result.weeklyEntries[0].weekStart)
        assertEquals(2, result.weeklyEntries[0].uniqueFoods)
        assertEquals("2024-01-08", result.weeklyEntries[1].weekStart)
        assertEquals(1, result.weeklyEntries[1].uniqueFoods)
    }

    @Test
    fun uniqueFoodsDeduplicatedByFoodId() {
        val entries =
            listOf(
                FoodEntry("2024-01-01", "food1", null, "Apple"),
                FoodEntry("2024-01-02", "food1", null, "Apple"),
                FoodEntry("2024-01-03", "food2", null, "Banana"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals(1, result.weeklyEntries.size)
        assertEquals(2, result.weeklyEntries[0].uniqueFoods)
    }

    @Test
    fun recipeIdUsedWhenFoodIdNull() {
        val entries =
            listOf(
                FoodEntry("2024-01-01", null, "recipe1", "My Recipe"),
                FoodEntry("2024-01-02", null, "recipe1", "My Recipe"),
                FoodEntry("2024-01-03", null, "recipe2", "Other Recipe"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals(2, result.weeklyEntries[0].uniqueFoods)
    }

    @Test
    fun foodNameUsedWhenBothIdsNull() {
        val entries =
            listOf(
                FoodEntry("2024-01-01", null, null, "Quick Log Meal"),
                FoodEntry("2024-01-02", null, null, "Quick Log Meal"),
                FoodEntry("2024-01-03", null, null, "Different Meal"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals(2, result.weeklyEntries[0].uniqueFoods)
    }

    @Test
    fun trendDetectionIncreasing() {
        // Week 1-2: 3 unique foods each; Week 3-4: 6 unique foods each
        val entries = mutableListOf<FoodEntry>()
        // Weeks 1-2 (low diversity)
        for (w in 0..1) {
            for (f in 1..3) {
                entries.add(FoodEntry("2024-01-${(1 + w * 7).toString().padStart(2, '0')}", "food$f", null, "Food$f"))
            }
        }
        // Weeks 3-4 (high diversity)
        for (w in 2..3) {
            for (f in 1..6) {
                entries.add(FoodEntry("2024-01-${(1 + w * 7).toString().padStart(2, '0')}", "food$f", null, "Food$f"))
            }
        }
        val result = computeFoodDiversity(entries)
        assertEquals("increasing", result.trend)
    }

    @Test
    fun trendDetectionDecreasing() {
        val entries = mutableListOf<FoodEntry>()
        // Weeks 1-2 (high diversity)
        for (w in 0..1) {
            for (f in 1..6) {
                entries.add(FoodEntry("2024-01-${(1 + w * 7).toString().padStart(2, '0')}", "food$f", null, "Food$f"))
            }
        }
        // Weeks 3-4 (low diversity)
        for (w in 2..3) {
            for (f in 1..2) {
                entries.add(FoodEntry("2024-01-${(1 + w * 7).toString().padStart(2, '0')}", "food$f", null, "Food$f"))
            }
        }
        val result = computeFoodDiversity(entries)
        assertEquals("decreasing", result.trend)
    }

    @Test
    fun trendStableWithFewerThan4Weeks() {
        val entries =
            listOf(
                FoodEntry("2024-01-01", "food1", null, "Apple"),
                FoodEntry("2024-01-08", "food2", null, "Banana"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals("stable", result.trend)
    }

    @Test
    fun emptyReturnsZero() {
        val result = computeFoodDiversity(emptyList())
        assertEquals(0, result.weeklyEntries.size)
        assertEquals(0.0, result.avgUniquePerWeek)
        assertEquals("stable", result.trend)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun avgUniquePerWeekCalculatedCorrectly() {
        val entries =
            listOf(
                FoodEntry("2024-01-01", "food1", null, "Apple"),
                FoodEntry("2024-01-01", "food2", null, "Banana"),
                FoodEntry("2024-01-08", "food3", null, "Cherry"),
            )
        val result = computeFoodDiversity(entries)
        assertEquals(1.5, result.avgUniquePerWeek)
    }
}
