package com.bissbilanz.android.util

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MoneyFormatTest {
    @Test
    fun englishUsesADollarPrefixAndTwoDecimals() {
        assertEquals("$4.20", formatUsd(4.2, Locale.US))
        assertEquals("$8.00", formatUsd(8.0, Locale.US))
    }

    @Test
    fun germanPutsTheDollarSignAfterTheAmountWithACommaDecimal() {
        val formatted = formatUsd(4.2, Locale.GERMANY)

        assertEquals("4,20", formatted.substringBefore('$').trim())
        assertTrue(formatted.endsWith("$"))
    }

    @Test
    fun roundsToTwoDecimals() {
        assertEquals("$0.13", formatUsd(0.126, Locale.US))
    }
}
