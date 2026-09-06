package com.bissbilanz.android.ui.components

import com.bissbilanz.model.Entry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * The dashboard cards that read a server-side aggregate key their fetch on this. An
 * entry count would have been enough for a new log but not for an edit, which is exactly
 * the case that left the meal breakdown and the trend contradicting the rings.
 */
class DashboardWidgetsSignatureTest {
    private fun entry(
        id: String,
        meal: String = "Lunch",
        servings: Double = 1.0,
        calories: Double = 200.0,
    ) = Entry(
        id = id,
        date = "2026-09-06",
        mealType = meal,
        servings = servings,
        quickCalories = calories,
    )

    @Test
    fun theSameDayGivesTheSameKey() {
        val day = listOf(entry("a"), entry("b"))

        assertEquals(day.calorieSignature(), listOf(entry("a"), entry("b")).calorieSignature())
    }

    @Test
    fun loggingSomethingChangesTheKey() {
        val before = listOf(entry("a"))

        assertNotEquals(before.calorieSignature(), (before + entry("b")).calorieSignature())
    }

    @Test
    fun editingAnEntryChangesTheKeyEvenThoughTheCountIsUnchanged() {
        val before = listOf(entry("a", servings = 1.0))
        val after = listOf(entry("a", servings = 2.0))

        assertNotEquals(before.calorieSignature(), after.calorieSignature())
    }

    @Test
    fun movingAnEntryToAnotherMealChangesTheKey() {
        val before = listOf(entry("a", meal = "Lunch"))
        val after = listOf(entry("a", meal = "Dinner"))

        assertNotEquals(before.calorieSignature(), after.calorieSignature())
    }

    @Test
    fun swappingATempIdForTheServerIdChangesTheKey() {
        // The sync manager replaces the optimistic row once the create uploads; that is
        // the moment the server aggregate finally knows about the entry.
        val before = listOf(entry("temp_1"))
        val after = listOf(entry("srv-1"))

        assertNotEquals(before.calorieSignature(), after.calorieSignature())
    }
}
