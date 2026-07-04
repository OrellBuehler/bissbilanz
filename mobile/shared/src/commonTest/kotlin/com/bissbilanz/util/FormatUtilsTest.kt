package com.bissbilanz.util

import kotlin.test.Test
import kotlin.test.assertEquals

class FormatUtilsTest {
    @Test
    fun formatAsIntRoundsToNearestWholeNumber() {
        assertEquals("245", 245.4.formatAsInt())
        assertEquals("246", 245.6.formatAsInt())
        assertEquals("0", 0.0.formatAsInt())
        assertEquals("-3", (-2.6).formatAsInt())
    }

    @Test
    fun formatDecimal1AlwaysShowsOneDecimalPlace() {
        assertEquals("4.0", 4.0.formatDecimal1())
        assertEquals("4.5", 4.5.formatDecimal1())
        assertEquals("4.2", 4.24.formatDecimal1())
        assertEquals("0.0", 0.0.formatDecimal1())
    }

    @Test
    fun formatDecimal1HandlesNegativeValues() {
        assertEquals("-1.5", (-1.5).formatDecimal1())
        assertEquals("-0.3", (-0.3).formatDecimal1())
        assertEquals("0.0", (-0.04).formatDecimal1())
    }
}
