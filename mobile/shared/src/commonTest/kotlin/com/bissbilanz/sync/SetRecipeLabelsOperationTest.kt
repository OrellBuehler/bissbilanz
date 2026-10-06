package com.bissbilanz.sync

import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals

class SetRecipeLabelsOperationTest {
    @Test
    fun roundTripsThroughTheQueueEncoding() {
        val op: SyncOperation = SyncOperation.SetRecipeLabels("recipe-1", listOf("soup", "curry"))
        val encoded = testJson.encodeToString(SyncOperation.serializer(), op)
        assertEquals(op, testJson.decodeFromString(SyncOperation.serializer(), encoded))
        assertEquals("recipes", op.affectedTable)
        assertEquals("recipe-1", op.affectedId)
    }

    @Test
    fun followsItsRecipeToTheServerId() {
        val op = SyncOperation.SetRecipeLabels("temp-1", listOf("soup"))
        val remapped = remapTempIds(op, mapOf("temp-1" to "srv-1"), testJson)
        assertEquals(SyncOperation.SetRecipeLabels("srv-1", listOf("soup")), remapped)
        assertEquals(op, remapTempIds(op, mapOf("other" to "x"), testJson))
    }
}
