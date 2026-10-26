package com.bissbilanz.android.ui.components

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class QuickEntrySaveTest {
    @Test
    fun aNamedEntryWithPositiveCaloriesCanBeSaved() {
        assertTrue(canSaveQuickEntry("Kebab", "700"))
    }

    @Test
    fun blankOrZeroCaloriesBlockSaving() {
        assertFalse(canSaveQuickEntry("Kebab", ""))
        assertFalse(canSaveQuickEntry("Kebab", "0"))
        assertFalse(canSaveQuickEntry("Kebab", "abc"))
    }

    @Test
    fun aBlankNameBlocksSaving() {
        assertFalse(canSaveQuickEntry("  ", "700"))
    }
}
