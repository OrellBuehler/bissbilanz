package com.bissbilanz.sync

import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals

class ReminderOperationTest {
    private val updateBody = testJson.encodeToString(ReminderUpdate.serializer(), ReminderUpdate(enabled = false))

    @Test
    fun updateReminderRoundTripsThroughTheQueueEncoding() {
        val op: SyncOperation = SyncOperation.UpdateReminder("reminder-1", updateBody)
        val encoded = testJson.encodeToString(SyncOperation.serializer(), op)
        assertEquals(op, testJson.decodeFromString(SyncOperation.serializer(), encoded))
        assertEquals("reminders", op.affectedTable)
        assertEquals("reminder-1", op.affectedId)
    }

    @Test
    fun updateReminderFollowsItsReminderToTheServerId() {
        val op = SyncOperation.UpdateReminder("temp-1", updateBody)
        val remapped = remapTempIds(op, mapOf("temp-1" to "srv-1"), testJson)
        assertEquals(SyncOperation.UpdateReminder("srv-1", updateBody), remapped)
        assertEquals(op, remapTempIds(op, mapOf("other" to "x"), testJson))
    }

    @Test
    fun deleteReminderRoundTripsThroughTheQueueEncoding() {
        val op: SyncOperation = SyncOperation.DeleteReminder("reminder-1")
        val encoded = testJson.encodeToString(SyncOperation.serializer(), op)
        assertEquals(op, testJson.decodeFromString(SyncOperation.serializer(), encoded))
        assertEquals("reminders", op.affectedTable)
        assertEquals("reminder-1", op.affectedId)
    }

    @Test
    fun deleteReminderFollowsItsReminderToTheServerId() {
        val op = SyncOperation.DeleteReminder("temp-1")
        val remapped = remapTempIds(op, mapOf("temp-1" to "srv-1"), testJson)
        assertEquals(SyncOperation.DeleteReminder("srv-1"), remapped)
        assertEquals(op, remapTempIds(op, mapOf("other" to "x"), testJson))
    }
}
