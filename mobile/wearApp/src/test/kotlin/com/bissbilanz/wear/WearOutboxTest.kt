package com.bissbilanz.wear

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * The queue's one job is that a write the user made is never lost without being
 * reported, which is exactly what its bound has to respect.
 */
class WearOutboxTest {
    private fun item(id: Long) = WearOutboxItem(id = id, path = WearPaths.LOG_FOOD, payload = """{"id":$id}""")

    @Test
    fun `a new write goes behind the ones already waiting`() {
        // Order is the whole point: the phone must see the day's writes as made.
        assertEquals(
            listOf(item(1), item(2), item(3)),
            WearOutbox.appended(listOf(item(1), item(2)), item(3)),
        )
    }

    @Test
    fun `a full queue refuses the new write rather than destroying the oldest`() {
        val full = (1..WearLimits.OUTBOX).map { item(it.toLong()) }
        // Making room silently would drop a write already reported as queued
        // while answering "queued" for the one that replaced it.
        assertNull(WearOutbox.appended(full, item(999)))
    }

    @Test
    fun `the last free slot is still usable`() {
        val nearlyFull = (1 until WearLimits.OUTBOX).map { item(it.toLong()) }
        assertEquals(WearLimits.OUTBOX, WearOutbox.appended(nearlyFull, item(999))?.size)
    }
}
