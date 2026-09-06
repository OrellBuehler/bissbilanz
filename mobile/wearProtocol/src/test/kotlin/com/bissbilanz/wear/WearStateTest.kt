package com.bissbilanz.wear

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class WearStateTest {
    private val json = Json { ignoreUnknownKeys = true }

    private val state =
        WearState(
            date = "2026-08-15",
            totals = WearMacros(calories = 1400.0, protein = 90.0),
            goals = WearMacros(calories = 2200.0, protein = 150.0),
            meals =
                listOf(
                    WearMealTotal(mealType = "Breakfast", calories = 400.0),
                    WearMealTotal(mealType = "Lunch", calories = 1000.0),
                ),
            mealTypes = listOf("breakfast", "lunch"),
            favorites = listOf(WearFoodRef(id = "f1", name = "Skyr", calories = 120.0)),
            weight = WearWeightInfo(latestKg = 78.4, latestDate = "2026-08-15", delta7dKg = -0.3),
            sleep = WearSleepInfo(date = "2026-08-15", durationMinutes = 452, quality = 7.0),
            localeCode = "de",
        )

    @Test
    fun `state survives a JSON round trip`() {
        val decoded = json.decodeFromString<WearState>(json.encodeToString(state))
        assertEquals(state, decoded)
    }

    @Test
    fun `same-day state keeps its totals`() {
        assertEquals(1400.0, state.resetIfStale("2026-08-15").totals.calories)
    }

    @Test
    fun `stale totals are zeroed but goals and reference data survive`() {
        val fresh = state.resetIfStale("2026-08-16")
        assertEquals(0.0, fresh.totals.calories)
        assertEquals(0.0, fresh.totals.protein)
        // Yesterday's meals are as day-bound as the totals they add up to.
        assertEquals(emptyList(), fresh.meals)
        assertEquals("2026-08-16", fresh.date)
        // Goals, weight and sleep are reference data — they are not day-bound.
        assertEquals(2200.0, fresh.goals.calories)
        assertNotNull(fresh.weight)
        assertNotNull(fresh.sleep)
        assertEquals(state.favorites, fresh.favorites)
    }

    @Test
    fun `same-day state keeps its meal breakdown`() {
        assertEquals(2, state.resetIfStale("2026-08-15").meals.size)
    }

    @Test
    fun `a payload written by an older phone still decodes`() {
        // Optional fields were added over time; a watch on a newer build must not
        // fail to decode a phone that has not been updated yet.
        val legacy = """{"date":"2026-08-15"}"""
        val decoded = json.decodeFromString<WearState>(legacy)
        assertEquals("2026-08-15", decoded.date)
        assertEquals(0.0, decoded.totals.calories)
        assertEquals(emptyList(), decoded.favorites)
        assertEquals(emptyList(), decoded.meals)
        // No language from the phone means the watch keeps its system locale.
        assertNull(decoded.localeCode)
    }

    @Test
    fun `a request from an older watch decodes without a request id`() {
        val legacy = """{"mealType":"Lunch","servings":1.0,"date":"2026-08-15"}"""
        assertNull(json.decodeFromString<WearLogRequest>(legacy).requestId)
    }

    @Test
    fun `request ids survive the round trip that retries depend on`() {
        val weight = WearWeightLogRequest(weightKg = 78.4, date = "2026-08-15", requestId = "w-1")
        val sleep =
            WearSleepLogRequest(durationMinutes = 452, quality = 7.0, date = "2026-08-15", requestId = "s-1")
        assertEquals("w-1", json.decodeFromString<WearWeightLogRequest>(json.encodeToString(weight)).requestId)
        assertEquals("s-1", json.decodeFromString<WearSleepLogRequest>(json.encodeToString(sleep)).requestId)
    }

    @Test
    fun `log requests round trip both food and recipe shapes`() {
        val food = WearLogRequest(foodId = "f1", mealType = "lunch", servings = 1.5, date = "2026-08-15")
        val recipe = WearLogRequest(recipeId = "r1", mealType = "dinner", servings = 1.0, date = "2026-08-15")
        assertEquals(food, json.decodeFromString<WearLogRequest>(json.encodeToString(food)))
        assertEquals(recipe, json.decodeFromString<WearLogRequest>(json.encodeToString(recipe)))
    }
}
