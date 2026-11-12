package com.bissbilanz.android.util

import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
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
    fun monthHeaderUsesTheShortMonthName() {
        assertEquals("Okt. 2026", formatMonthYear(2026, Month.OCTOBER, Locale.GERMANY))
        assertEquals("Oct 2026", formatMonthYear(2026, Month.OCTOBER, Locale.US))
    }

    @Test
    fun nonDateStringsAreShownUnchanged() {
        assertEquals("someday", formatIsoDate("someday"))
        assertEquals("someday", formatIsoDateTime("someday"))
    }

    @Test
    fun instantsShowTheNumericDateAndShortTimeInTheGivenZone() {
        val zurich = TimeZone.of("Europe/Zurich")
        assertEquals("12.11.2026 14:03", formatIsoDateTime("2026-11-12T13:03:00.000Z", zurich, Locale.GERMANY))
        assertEquals("13.11.2026 00:30", formatIsoDateTime("2026-11-12T23:30:00Z", zurich, Locale.GERMANY))
        assertEquals("11/12/2026", formatIsoDateTime("2026-11-12T13:03:00Z", zurich, Locale.US).substringBefore(' '))
    }
}
