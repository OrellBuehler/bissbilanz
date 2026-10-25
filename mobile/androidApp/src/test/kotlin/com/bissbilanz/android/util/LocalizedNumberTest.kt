package com.bissbilanz.android.util

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class LocalizedNumberTest {
    @Test
    fun usesTheLocaleDecimalSeparator() {
        assertEquals("7.4", formatLocalizedNumber(7.44, 1, Locale.US))
        assertEquals("7,4", formatLocalizedNumber(7.44, 1, Locale.GERMANY))
    }

    @Test
    fun dropsATrailingZero() {
        assertEquals("7", formatLocalizedNumber(7.0, 1, Locale.GERMANY))
    }

    @Test
    fun wholeNumbersAreRoundedWithoutGrouping() {
        assertEquals("2346", formatLocalizedNumber(2345.6, 0, Locale.GERMANY))
    }
}
