package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class DateUtilsTest {
    @Test
    fun shiftForwardOneDay() {
        assertEquals("2024-01-02", shiftDate("2024-01-01", 1))
    }

    @Test
    fun shiftBackwardOneDay() {
        assertEquals("2023-12-31", shiftDate("2024-01-01", -1))
    }

    @Test
    fun shiftZeroDays() {
        assertEquals("2024-06-15", shiftDate("2024-06-15", 0))
    }

    @Test
    fun shiftAcrossMonthBoundary() {
        assertEquals("2024-02-01", shiftDate("2024-01-31", 1))
    }

    @Test
    fun shiftAcrossYearBoundary() {
        assertEquals("2025-01-01", shiftDate("2024-12-31", 1))
    }

    @Test
    fun shiftLeapYearFeb29() {
        assertEquals("2024-02-29", shiftDate("2024-02-28", 1))
    }

    @Test
    fun shiftNonLeapYearFeb28() {
        assertEquals("2023-03-01", shiftDate("2023-02-28", 1))
    }

    @Test
    fun shiftLargeOffset() {
        assertEquals("2024-12-31", shiftDate("2024-01-01", 365))
    }

    @Test
    fun shiftLargeNegativeOffset() {
        assertEquals("2023-01-01", shiftDate("2024-01-01", -365))
    }

    @Test
    fun invalidDateFormatThrows() {
        assertFailsWith<Exception> {
            shiftDate("not-a-date", 1)
        }
    }
}
