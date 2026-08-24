package com.bissbilanz.android.reminders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Request codes are how a later `AlarmManager.cancel` finds the PendingIntent we armed, so
 * they must be stable across processes and must not collide between the alarm, the snooze
 * and the three notification actions of the same slot.
 */
class SupplementReminderSchedulerTest {
    private val id = "0f9e6d3c-1111-4222-8333-444455556666"

    @Test
    fun requestCodesAreStableForTheSameSlot() {
        assertEquals(
            SupplementReminderScheduler.alarmRequestCode(id, "08:00"),
            SupplementReminderScheduler.alarmRequestCode(id, "08:00"),
        )
        assertEquals(
            SupplementReminderScheduler.notificationId(id, "20:30"),
            SupplementReminderScheduler.notificationId(id, "20:30"),
        )
    }

    @Test
    fun everyCodeForOneSlotIsDistinct() {
        val base = SupplementReminderScheduler.actionRequestCodeBase(id, "08:00")
        val codes =
            listOf(
                SupplementReminderScheduler.alarmRequestCode(id, "08:00"),
                SupplementReminderScheduler.snoozeRequestCode(id, "08:00"),
                base,
                // The notifier derives the three action codes as base, base+1, base+2.
                base + 1,
                base + 2,
                SupplementReminderScheduler.notificationId(id, "08:00"),
            )
        assertEquals(codes.size, codes.distinct().size, "codes collide: $codes")
    }

    @Test
    fun differentTimesOnTheSameSupplementGetDifferentCodes() {
        assertTrue(
            SupplementReminderScheduler.alarmRequestCode(id, "08:00") !=
                SupplementReminderScheduler.alarmRequestCode(id, "20:00"),
        )
    }

    @Test
    fun codesAreNonNegativeSoTheEightWaySpreadCannotOverflow() {
        // A raw hashCode is frequently negative; *8 on a negative would wrap.
        for (time in listOf("00:00", "08:00", "12:30", "23:59")) {
            for (supplementId in listOf(id, "a", "zzzzzzzzzzzzzzzzzzzz", "")) {
                assertTrue(SupplementReminderScheduler.alarmRequestCode(supplementId, time) >= 0)
                assertTrue(SupplementReminderScheduler.notificationId(supplementId, time) >= 0)
            }
        }
    }

    @Test
    fun slotKeyRoundTripsThroughATimeContainingNoPipe() {
        assertEquals("$id|08:00", SupplementReminderScheduler.slotKey(id, "08:00"))
    }
}
