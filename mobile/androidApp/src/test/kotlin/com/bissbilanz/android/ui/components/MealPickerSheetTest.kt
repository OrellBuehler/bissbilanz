package com.bissbilanz.android.ui.components

import java.util.Locale
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class MealPickerSheetTest {
    private lateinit var original: Locale

    @BeforeTest
    fun setup() {
        original = Locale.getDefault()
        Locale.setDefault(Locale.GERMANY)
    }

    @AfterTest
    fun tearDown() {
        Locale.setDefault(original)
    }

    @Test
    fun gramsAreRoundedToOneDecimal() {
        assertEquals("500", servingsToGramsText(1.5, 1000.0 / 3))
        assertEquals("333,3", servingsToGramsText(1.0, 1000.0 / 3))
    }

    @Test
    fun servingsUseTheLocaleSeparator() {
        assertEquals("1,5", gramsToServingsText(150.0, 100.0))
    }

    @Test
    fun servingsAreRoundedToThreeDecimals() {
        assertEquals("0,333", gramsToServingsText(100.0, 300.0))
    }
}
