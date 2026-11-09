package com.bissbilanz.android.util

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class FoodExtraNutrientsTest {
    @Test
    fun keepsFullPrecisionInsteadOfOneDecimal() {
        assertEquals("0.04", 0.04.toEditableString(Locale.US))
        assertEquals("12.345", 12.345.toEditableString(Locale.US))
    }

    @Test
    fun stripsTrailingZerosAndNeverUsesScientificNotation() {
        assertEquals("100", 100.0.toEditableString(Locale.US))
        assertEquals("0", 0.0.toEditableString(Locale.US))
        assertEquals("0.00004", 0.00004.toEditableString(Locale.US))
    }

    @Test
    fun dropsFloatNoise() {
        assertEquals("0.3", (0.1 + 0.2).toEditableString(Locale.US))
    }

    @Test
    fun usesTheLocaleDecimalSeparator() {
        assertEquals("1,5", 1.5.toEditableString(Locale.GERMANY))
    }
}
