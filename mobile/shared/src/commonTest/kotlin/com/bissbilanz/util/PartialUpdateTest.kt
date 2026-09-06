package com.bissbilanz.util

import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.test.testJson
import kotlinx.serialization.json.JsonNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The shared Json runs with `encodeDefaults = false`, so a null property of a generated
 * `*Update` model never reaches the wire — "leave this alone" and "clear this" look
 * identical. The server only writes a column when the key is present, so clearing has to
 * be spelled out as an explicit JSON null.
 */
class PartialUpdateTest {
    @Test
    fun aNullFieldIsOmittedWithoutAnExplicitClear() {
        val body = testJson.encodePartialUpdate(EntryUpdate(servings = 2.0), emptyList())

        assertEquals(setOf("servings"), body.keys)
        assertFalse("quickProtein" in body, "an untouched field must not be sent at all")
    }

    @Test
    fun aClearedFieldIsSentAsAnExplicitNull() {
        val body =
            testJson.encodePartialUpdate(
                EntryUpdate(servings = 2.0),
                setOf(EntryField.QUICK_PROTEIN).jsonKeys(),
            )

        assertEquals(JsonNull, body["quickProtein"])
        assertTrue(body.toString().contains("\"quickProtein\":null"))
    }

    @Test
    fun clearingTheLastNutrientStillReachesTheServer() {
        // Removing one of two nutrients sends the shrunken map; removing the last one
        // leaves an empty map the UI turns into null, which used to vanish on the wire.
        val body =
            testJson.encodePartialUpdate(
                EntryUpdate(quickNutrients = null),
                setOf(EntryField.QUICK_NUTRIENTS).jsonKeys(),
            )

        assertEquals(JsonNull, body["quickNutrients"])
    }

    @Test
    fun clearingBiologicalSexSurvivesEncoding() {
        val body =
            testJson.encodePartialUpdate(
                PreferencesUpdate(biologicalSex = null),
                setOf(PreferencesField.BIOLOGICAL_SEX).jsonKeys(),
            )

        assertEquals(JsonNull, body["biologicalSex"])
    }

    @Test
    fun aClearWinsOverAValueForTheSameKey() {
        val body =
            testJson.encodePartialUpdate(
                EntryUpdate(notes = "kept?"),
                setOf(EntryField.NOTES).jsonKeys(),
            )

        assertEquals(JsonNull, body["notes"])
    }

    @Test
    fun jsonKeysAreSortedAndDeduplicated() {
        val keys = listOf(EntryField.QUICK_NAME, EntryField.NOTES, EntryField.NOTES).jsonKeys()

        assertEquals(listOf("notes", "quickName"), keys)
    }
}
