package com.bissbilanz.android.util

import com.bissbilanz.android.ui.components.formatBytes
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class NumberFormatUtilsTest {
    @Test
    fun wholeNumbersHaveNoDecimals() {
        assertEquals("2", formatDecimal(2.0, locale = Locale.US))
    }

    @Test
    fun fractionsUseTheLocaleSeparator() {
        assertEquals("2.5", formatDecimal(2.5, locale = Locale.US))
        assertEquals("2,5", formatDecimal(2.5, locale = Locale.GERMANY))
        assertEquals("0,33", formatDecimal(1.0 / 3, locale = Locale.GERMANY))
    }

    @Test
    fun packageSizesAreLocalized() {
        assertEquals("1,5 MB", formatBytes(1_572_864, Locale.GERMANY))
        assertEquals("1.5 MB", formatBytes(1_572_864, Locale.US))
        assertEquals("2 KB", formatBytes(2048, Locale.GERMANY))
    }
}
