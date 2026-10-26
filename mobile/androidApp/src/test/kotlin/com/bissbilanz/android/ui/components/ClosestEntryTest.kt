package com.bissbilanz.android.ui.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ClosestEntryTest {
    private val days = listOf("2026-09-01", "2026-09-04", "2026-09-10")

    private fun closest(date: String) = days.closestToDate(date) { it }

    @Test
    fun anEntryOnTheDayWins() {
        assertEquals("2026-09-04", closest("2026-09-04"))
    }

    @Test
    fun theLatestEarlierEntryIsPreferredOverALaterOne() {
        assertEquals("2026-09-04", closest("2026-09-09"))
    }

    @Test
    fun withNothingEarlierTheEarliestLaterEntryIsUsed() {
        assertEquals("2026-09-01", closest("2026-08-20"))
    }

    @Test
    fun noEntriesGivesNothing() {
        assertNull(emptyList<String>().closestToDate("2026-09-04") { it })
    }
}
