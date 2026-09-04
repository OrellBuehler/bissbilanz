package com.bissbilanz.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Vectors mirror tests/server/labels.test.ts: the client folds a search query
 * exactly the way the server folded what it stored, or nothing matches.
 */
class LabelsTest {
    @Test
    fun lowercasesTrimsAndSingularizes() {
        assertEquals("banana", normalizeLabel("  Bananas "))
        assertEquals("sliced bread", normalizeLabel("Sliced Breads"))
        assertEquals("cherry", normalizeLabel("cherries"))
        assertEquals("tomato", normalizeLabel("tomatoes"))
        assertEquals("sandwich", normalizeLabel("sandwiches"))
    }

    @Test
    fun keepsWordsThatOnlyLookPlural() {
        assertEquals("glass", normalizeLabel("glass"))
        assertEquals("hummus", normalizeLabel("hummus"))
        assertEquals("gas", normalizeLabel("gas"))
    }

    @Test
    fun foldsAccentsAndClosesApostrophes() {
        assertEquals("puree", normalizeLabel("Püree"))
        assertEquals("shepherd pie", normalizeLabel("shepherd's pie"))
    }

    @Test
    fun rejectsWhatCanNeverBeAnEnglishNoun() {
        assertNull(normalizeLabel(""))
        assertNull(normalizeLabel("   "))
        assertNull(normalizeLabel("Weißbrot"))
        assertNull(normalizeLabel("хлеб"))
        assertNull(normalizeLabel("one two three four"))
    }

    @Test
    fun dedupesAndCaps() {
        assertEquals(listOf("banana", "fruit"), normalizeLabels(listOf("Banana", "bananas", "FRUIT", "")))
        val many = (1..30).map { "label$it" }
        assertEquals(MAX_LABELS_PER_FOOD, normalizeLabels(many).size)
    }
}
