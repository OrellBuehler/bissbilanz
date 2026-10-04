package com.bissbilanz.android.util

import kotlinx.datetime.LocalDate
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class DateFormatUtilsTest {
    private val date = LocalDate(2026, 9, 3)

    @Test
    fun germanUsesDottedFourDigitYear() {
        assertEquals("03.09.2026", formatShortDate(date, Locale.GERMANY))
    }

    @Test
    fun swissGermanUsesDottedFourDigitYear() {
        assertEquals("03.09.2026", formatShortDate(date, Locale.forLanguageTag("de-CH")))
    }

    @Test
    fun englishKeepsItsOwnOrderWithFourDigitYear() {
        assertEquals("9/3/2026", formatShortDate(date, Locale.US))
        assertEquals("03/09/2026", formatShortDate(date, Locale.UK))
    }

    @Test
    fun isoStringsAreFormattedAndTimestampsUseTheirDatePart() {
        val previous = Locale.getDefault()
        Locale.setDefault(Locale.GERMANY)
        try {
            assertEquals("03.10.2026", formatIsoDate("2026-10-03"))
            assertEquals("03.10.2026", formatIsoDate("2026-10-03T08:15:00Z"))
        } finally {
            Locale.setDefault(previous)
        }
    }

    @Test
    fun nonDateStringsAreShownUnchanged() {
        assertEquals("someday", formatIsoDate("someday"))
    }
}
