package com.bissbilanz.android.chat

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

class ViewedDiaryDayTest {
    private var now = Instant.parse("2026-11-20T08:00:00Z")
    private val day = ViewedDiaryDay { now }

    @Test
    fun theDayOnScreenIsCurrent() {
        day.viewing("2026-11-18")
        now += ViewedDiaryDay.RECENT * 3

        assertEquals("2026-11-18", day.current())
    }

    @Test
    fun aDayStaysCurrentForAWhileAfterItsScreenLeft() {
        day.viewing("2026-11-18")
        day.left("2026-11-18")

        now += 5.minutes
        assertEquals("2026-11-18", day.current())
        now += ViewedDiaryDay.RECENT
        assertNull(day.current())
    }

    @Test
    fun switchingDaysKeepsTheNewOne() {
        day.viewing("2026-11-18")
        day.left("2026-11-18")
        day.viewing("2026-11-19")
        now += ViewedDiaryDay.RECENT * 3

        assertEquals("2026-11-19", day.current())
    }

    @Test
    fun theOldScreenLeavingDoesNotEndTheNewDay() {
        day.viewing("2026-11-19")
        day.left("2026-11-18")
        now += ViewedDiaryDay.RECENT * 3

        assertEquals("2026-11-19", day.current())
    }

    @Test
    fun nothingViewedIsNoDay() {
        assertNull(day.current())
    }
}
