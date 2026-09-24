package com.bissbilanz.android.reminders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Parallel to [SupplementReminderSchedulerTest]: request codes are how a later
 * `AlarmManager.cancel` finds the PendingIntent we armed, so they must be stable across
 * processes, must not collide between the alarm, the snooze and the two notification
 * actions of the same slot, and — since [ReminderScheduler] targets a different
 * receiver class but derives its codes the same way as [SupplementReminderScheduler] —
 * must not collide with a supplement's codes for the same id and time either.
 */
class ReminderSchedulerTest {
    private val id = "0f9e6d3c-1111-4222-8333-444455556666"

    @Test
    fun requestCodesAreStableForTheSameSlot() {
        assertEquals(
            ReminderScheduler.alarmRequestCode(id, "08:00"),
            ReminderScheduler.alarmRequestCode(id, "08:00"),
        )
        assertEquals(
            ReminderScheduler.notificationId(id, "20:30"),
            ReminderScheduler.notificationId(id, "20:30"),
        )
    }

    @Test
    fun everyCodeForOneSlotIsDistinct() {
        val base = ReminderScheduler.actionRequestCodeBase(id, "08:00")
        val codes =
            listOf(
                ReminderScheduler.alarmRequestCode(id, "08:00"),
                ReminderScheduler.snoozeRequestCode(id, "08:00"),
                base,
                // The notifier derives the two action codes as base and base+1.
                base + 1,
                ReminderScheduler.notificationId(id, "08:00"),
            )
        assertEquals(codes.size, codes.distinct().size, "codes collide: $codes")
    }

    @Test
    fun differentTimesOnTheSameReminderGetDifferentCodes() {
        assertTrue(
            ReminderScheduler.alarmRequestCode(id, "08:00") !=
                ReminderScheduler.alarmRequestCode(id, "20:00"),
        )
    }

    @Test
    fun codesAreNonNegativeSoTheEightWaySpreadCannotOverflow() {
        // A raw hashCode is frequently negative; *8 on a negative would wrap.
        for (time in listOf("00:00", "08:00", "12:30", "23:59")) {
            for (reminderId in listOf(id, "a", "zzzzzzzzzzzzzzzzzzzz", "")) {
                assertTrue(ReminderScheduler.alarmRequestCode(reminderId, time) >= 0)
                assertTrue(ReminderScheduler.notificationId(reminderId, time) >= 0)
            }
        }
    }

    @Test
    fun slotKeyCarriesTheReminderPrefix() {
        assertEquals("reminder:$id|08:00", ReminderScheduler.slotKey(id, "08:00"))
    }

    @Test
    fun requestCodesDoNotCollideWithSupplementCodesForTheSameIdAndTime() {
        for (time in listOf("00:00", "08:00", "12:30", "23:59")) {
            assertTrue(
                ReminderScheduler.alarmRequestCode(id, time) !=
                    SupplementReminderScheduler.alarmRequestCode(id, time),
            )
            assertTrue(
                ReminderScheduler.snoozeRequestCode(id, time) !=
                    SupplementReminderScheduler.snoozeRequestCode(id, time),
            )
            assertTrue(
                ReminderScheduler.notificationId(id, time) !=
                    SupplementReminderScheduler.notificationId(id, time),
            )
            assertTrue(
                ReminderScheduler.actionRequestCodeBase(id, time) !=
                    SupplementReminderScheduler.actionRequestCodeBase(id, time),
            )
        }
    }

    @Test
    fun slotKeyDoesNotCollideWithASupplementSlotKeyForTheSameIdAndTime() {
        assertTrue(ReminderScheduler.slotKey(id, "08:00") != SupplementReminderScheduler.slotKey(id, "08:00"))
    }
}
