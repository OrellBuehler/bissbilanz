package com.bissbilanz.sync

import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals

class SetFoodLabelsOperationTest {
    @Test
    fun roundTripsThroughTheQueueEncoding() {
        val op: SyncOperation = SyncOperation.SetFoodLabels("food-1", listOf("banana", "fruit"))
        val encoded = testJson.encodeToString(SyncOperation.serializer(), op)
        assertEquals(op, testJson.decodeFromString(SyncOperation.serializer(), encoded))
        assertEquals("foods", op.affectedTable)
        assertEquals("food-1", op.affectedId)
    }

    @Test
    fun followsItsFoodToTheServerId() {
        val op = SyncOperation.SetFoodLabels("temp-1", listOf("banana"))
        val remapped = remapTempIds(op, mapOf("temp-1" to "srv-1"), testJson)
        assertEquals(SyncOperation.SetFoodLabels("srv-1", listOf("banana")), remapped)
        assertEquals(op, remapTempIds(op, mapOf("other" to "x"), testJson))
    }
}
