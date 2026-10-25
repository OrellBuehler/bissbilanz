package com.bissbilanz.android.util

import com.bissbilanz.android.ui.components.formatBytes
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
    fun keepsFixedDecimalsAndRoundsHalfUp() {
        assertEquals("72,0", formatLocalizedNumber(72.0, 1, Locale.GERMANY, minDecimals = 1))
        assertEquals("72.3", formatLocalizedNumber(72.25, 1, Locale.US, minDecimals = 1))
    }

    @Test
    fun wholeNumbersAreRoundedWithoutGrouping() {
        assertEquals("2346", formatLocalizedNumber(2345.6, 0, Locale.GERMANY))
    }

    @Test
    fun keepsUpToTheRequestedDecimals() {
        assertEquals("0,33", formatLocalizedNumber(1.0 / 3, 2, Locale.GERMANY))
        assertEquals("2.5", formatLocalizedNumber(2.5, 2, Locale.US))
    }

    @Test
    fun packageSizesAreLocalized() {
        assertEquals("1,5 MB", formatBytes(1_572_864, Locale.GERMANY))
        assertEquals("1.5 MB", formatBytes(1_572_864, Locale.US))
        assertEquals("2 KB", formatBytes(2048, Locale.GERMANY))
    }
}
