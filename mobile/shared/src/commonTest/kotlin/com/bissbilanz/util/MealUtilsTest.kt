package com.bissbilanz.util

import kotlin.test.Test
import kotlin.test.assertEquals

class MealUtilsTest {
    @Test
    fun mealForCurrentTimePicksBreakfastInTheMorning() {
        assertEquals("Breakfast", mealForCurrentTime(5))
        assertEquals("Breakfast", mealForCurrentTime(10))
    }

    @Test
    fun mealForCurrentTimePicksLunchAroundMidday() {
        assertEquals("Lunch", mealForCurrentTime(11))
        assertEquals("Lunch", mealForCurrentTime(13))
    }

    @Test
    fun mealForCurrentTimePicksSnacksInTheAfternoon() {
        assertEquals("Snacks", mealForCurrentTime(14))
        assertEquals("Snacks", mealForCurrentTime(16))
    }

    @Test
    fun mealForCurrentTimePicksDinnerOtherwise() {
        assertEquals("Dinner", mealForCurrentTime(17))
        assertEquals("Dinner", mealForCurrentTime(23))
        assertEquals("Dinner", mealForCurrentTime(0))
        assertEquals("Dinner", mealForCurrentTime(4))
    }
}
