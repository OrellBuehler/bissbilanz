package com.bissbilanz.android.ui.components

import com.bissbilanz.util.EntryField
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Which fields the entry editor reports as deliberately emptied. Getting this wrong is
 * invisible in the UI — the sheet closes either way — and either loses a value the user
 * kept or keeps one they removed.
 */
class EntryEditClearsTest {
    private fun cleared(
        isQuickEntry: Boolean = true,
        notes: String = "note",
        quickName: String = "Kebab",
        quickCalories: String = "700",
        quickProtein: String = "30",
        quickCarbs: String = "60",
        quickFat: String = "20",
        quickFiber: String = "4",
        quickNutrients: Map<String, String> = mapOf("sodium" to "400"),
    ) = clearedEntryFields(
        isQuickEntry = isQuickEntry,
        notes = notes,
        quickName = quickName,
        quickCalories = quickCalories,
        quickProtein = quickProtein,
        quickCarbs = quickCarbs,
        quickFat = quickFat,
        quickFiber = quickFiber,
        quickNutrients = quickNutrients,
    )

    @Test
    fun aFullyFilledFormClearsNothing() {
        assertEquals(emptySet(), cleared())
    }

    @Test
    fun anEmptiedMacroIsReportedAsCleared() {
        assertEquals(setOf(EntryField.QUICK_PROTEIN), cleared(quickProtein = ""))
    }

    @Test
    fun removingTheLastNutrientClearsTheMap() {
        assertEquals(setOf(EntryField.QUICK_NUTRIENTS), cleared(quickNutrients = emptyMap()))
    }

    @Test
    fun removingOneOfTwoNutrientsDoesNotClearTheMap() {
        val fields = cleared(quickNutrients = mapOf("sodium" to "400"))

        assertFalse(EntryField.QUICK_NUTRIENTS in fields)
    }

    @Test
    fun blankNutrientValuesCountAsNoNutrients() {
        // The row is still in the map while the user deletes the number, and
        // `toNutrientDoubles` drops it — so the map really is empty.
        assertTrue(EntryField.QUICK_NUTRIENTS in cleared(quickNutrients = mapOf("sodium" to "")))
    }

    @Test
    fun anUnparseableNumberIsLeftAloneRatherThanCleared() {
        assertFalse(EntryField.QUICK_PROTEIN in cleared(quickProtein = "abc"))
    }

    @Test
    fun aFoodBackedEntryOnlyEverClearsItsNote() {
        val fields =
            cleared(
                isQuickEntry = false,
                notes = "",
                quickName = "",
                quickCalories = "",
                quickProtein = "",
                quickCarbs = "",
                quickFat = "",
                quickFiber = "",
                quickNutrients = emptyMap(),
            )

        // The nutrition of a food- or recipe-backed entry lives on that record; the
        // sheet does not own those fields and must not null them.
        assertEquals(setOf(EntryField.NOTES), fields)
    }

    @Test
    fun anEmptiedNoteIsClearedForAnyEntry() {
        assertTrue(EntryField.NOTES in cleared(notes = "   "))
    }
}
