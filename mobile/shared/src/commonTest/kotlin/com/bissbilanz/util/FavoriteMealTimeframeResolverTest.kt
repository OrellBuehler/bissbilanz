package com.bissbilanz.util

import com.bissbilanz.api.generated.model.FavoriteMealTimeframe
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FavoriteMealTimeframeResolverTest {
    private val timeframes =
        listOf(
            fixture(mealType = "breakfast", startMinute = 6 * 60, endMinute = 10 * 60, sortOrder = 0),
            fixture(mealType = "lunch", startMinute = 11 * 60 + 30, endMinute = 14 * 60, sortOrder = 1),
            fixture(mealType = "dinner", startMinute = 18 * 60, endMinute = 22 * 60, sortOrder = 2),
        )

    @Test
    fun returnsMealTypeForTimeInsideWindow() {
        assertEquals("breakfast", resolveMealTypeForMinuteOfDay(7 * 60 + 30, timeframes))
        assertEquals("lunch", resolveMealTypeForMinuteOfDay(12 * 60, timeframes))
        assertEquals("dinner", resolveMealTypeForMinuteOfDay(19 * 60 + 45, timeframes))
    }

    @Test
    fun returnsNullWhenTimeFallsOutsideEveryWindow() {
        assertNull(resolveMealTypeForMinuteOfDay(4 * 60, timeframes))
        assertNull(resolveMealTypeForMinuteOfDay(15 * 60, timeframes))
    }

    @Test
    fun treatsWindowAsStartInclusiveEndExclusive() {
        assertEquals("breakfast", resolveMealTypeForMinuteOfDay(6 * 60, timeframes))
        assertNull(resolveMealTypeForMinuteOfDay(10 * 60, timeframes))
    }

    @Test
    fun returnsNullWhenListIsEmpty() {
        assertNull(resolveMealTypeForMinuteOfDay(12 * 60, emptyList()))
    }

    @Test
    fun prefersEarlierSortOrderWhenWindowsOverlap() {
        val overlapping =
            listOf(
                fixture(mealType = "snack", startMinute = 10 * 60, endMinute = 12 * 60, sortOrder = 5),
                fixture(mealType = "brunch", startMinute = 10 * 60, endMinute = 12 * 60, sortOrder = 1),
            )
        assertEquals("brunch", resolveMealTypeForMinuteOfDay(11 * 60, overlapping))
    }

    private fun fixture(
        mealType: String,
        startMinute: Int,
        endMinute: Int,
        sortOrder: Int,
    ): FavoriteMealTimeframe =
        FavoriteMealTimeframe(
            id = "$mealType-$startMinute",
            mealType = mealType,
            startMinute = startMinute,
            endMinute = endMinute,
            startTime = formatTime(startMinute),
            endTime = formatTime(endMinute),
            sortOrder = sortOrder,
            customMealTypeId = null,
        )

    private fun formatTime(minuteOfDay: Int): String {
        val h = minuteOfDay / 60
        val m = minuteOfDay % 60
        return (if (h < 10) "0$h" else "$h") + ":" + (if (m < 10) "0$m" else "$m")
    }
}
