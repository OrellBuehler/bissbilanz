package com.bissbilanz.model

import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals

class StatsSerializationTest {
    private val json = testJson

    @Test
    fun deserializeDailyStatsResponse() {
        val jsonStr =
            """
            {
                "data": [
                    {"date": "2024-01-01", "calories": 2100, "protein": 140, "carbs": 230, "fat": 70, "fiber": 28},
                    {"date": "2024-01-02", "calories": 1900, "protein": 155, "carbs": 210, "fat": 60, "fiber": 32}
                ],
                "goals": {
                    "calorieGoal": 2000,
                    "proteinGoal": 150,
                    "carbGoal": 250,
                    "fatGoal": 65,
                    "fiberGoal": 30
                }
            }
            """.trimIndent()
        val stats = json.decodeFromString<DailyStatsResponse>(jsonStr)
        assertEquals(2, stats.data.size)
        assertEquals("2024-01-01", stats.data[0].date)
        assertEquals(2100.0, stats.data[0].calories)
        assertEquals(2000.0, stats.goals?.calorieGoal)
    }

    @Test
    fun deserializeStreaksResponse() {
        val jsonStr = """{"currentStreak": 7, "longestStreak": 30}"""
        val streaks = json.decodeFromString<StreaksResponse>(jsonStr)
        assertEquals(7, streaks.currentStreak)
        assertEquals(30, streaks.longestStreak)
    }

    @Test
    fun deserializeTopFoodsResponse() {
        val jsonStr =
            """
            {
                "data": [
                    {
                        "foodId": "f1",
                        "recipeId": null,
                        "foodName": "Chicken Breast",
                        "count": 15,
                        "calories": 165,
                        "protein": 31,
                        "carbs": 0,
                        "fat": 3.6,
                        "fiber": 0
                    }
                ]
            }
            """.trimIndent()
        val topFoods = json.decodeFromString<TopFoodsResponse>(jsonStr)
        assertEquals(1, topFoods.data.size)
        assertEquals("Chicken Breast", topFoods.data[0].foodName)
        assertEquals(15, topFoods.data[0].count)
    }

    @Test
    fun deserializeMealBreakdownResponse() {
        val jsonStr =
            """
            {
                "data": [
                    {"mealType": "breakfast", "calories": 500, "protein": 30, "carbs": 60, "fat": 15, "fiber": 8},
                    {"mealType": "lunch", "calories": 700, "protein": 45, "carbs": 80, "fat": 25, "fiber": 10}
                ]
            }
            """.trimIndent()
        val breakdown = json.decodeFromString<MealBreakdownResponse>(jsonStr)
        assertEquals(2, breakdown.data.size)
        assertEquals("breakfast", breakdown.data[0].mealType)
        assertEquals(500.0, breakdown.data[0].calories)
    }

    @Test
    fun macroTotalsDefaultsToZero() {
        val totals = MacroTotals(calories = 0.0, protein = 0.0, carbs = 0.0, fat = 0.0, fiber = 0.0)
        assertEquals(0.0, totals.calories)
        assertEquals(0.0, totals.protein)
        assertEquals(0.0, totals.carbs)
        assertEquals(0.0, totals.fat)
        assertEquals(0.0, totals.fiber)
    }
}
