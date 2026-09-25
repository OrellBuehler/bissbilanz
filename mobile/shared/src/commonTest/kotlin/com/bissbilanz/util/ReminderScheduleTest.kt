package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Reminder
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Ported case-for-case from `tests/server/push-reminders.test.ts` (`dueGeneralReminders`)
 * on the web — the two must never drift on weekday numbering.
 */
class ReminderScheduleTest {
    private fun date(iso: String) = LocalDate.parse(iso)

    @Test
    fun sundayMapsToDayZero() {
        // 2026-02-22 is a Sunday; ISO gives it 7, the server numbering gives it 0.
        assertTrue(ReminderSchedule.isDueOn(listOf(0), date("2026-02-22")))
        assertFalse(ReminderSchedule.isDueOn(listOf(7), date("2026-02-22")))
    }

    @Test
    fun isDueOnMatchesTheDayOfWeek() {
        // 2026-02-17 is a Tuesday -> server day 2
        assertTrue(ReminderSchedule.isDueOn(listOf(2), date("2026-02-17")))
        assertFalse(ReminderSchedule.isDueOn(listOf(1), date("2026-02-17")))
    }

    @Test
    fun everyDayIsAlwaysDue() {
        val allWeekdays = (0..6).toList()
        assertTrue(ReminderSchedule.isDueOn(allWeekdays, date("2026-02-17")))
        assertTrue(ReminderSchedule.isDueOn(allWeekdays, date("2026-02-22")))
    }

    @Test
    fun emptyWeekdaysIsNeverDue() {
        assertFalse(ReminderSchedule.isDueOn(emptyList(), date("2026-02-17")))
    }

    @Test
    fun nextOccurrenceSkipsToTheNextDueDay() {
        // Tuesday 2026-02-17 09:00, reminder due Mon/Wed/Fri -> next is Wednesday 08:00
        val reminder = reminder(weekdays = listOf(1, 3, 5))
        val next = ReminderSchedule.nextOccurrence(reminder, LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 18, 8, 0), next)
    }

    @Test
    fun nextOccurrenceRollsToTomorrowWhenTodaysTimeHasPassed() {
        val reminder = reminder()
        val next = ReminderSchedule.nextOccurrence(reminder, LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 18, 8, 0), next)
    }

    @Test
    fun nextOccurrenceKeepsTodayWhenTheTimeIsStillAhead() {
        val reminder = reminder(time = "20:00")
        val next = ReminderSchedule.nextOccurrence(reminder, LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 17, 20, 0), next)
    }

    @Test
    fun nextOccurrenceIsNullForANeverDueReminder() {
        val reminder = reminder(weekdays = emptyList())
        assertNull(ReminderSchedule.nextOccurrence(reminder, LocalDateTime(2026, 2, 17, 9, 0)))
    }

    @Test
    fun nextOccurrenceIsNullForDisabledRemindersAndBadTimes() {
        val disabled = reminder(enabled = false)
        assertNull(ReminderSchedule.nextOccurrence(disabled, LocalDateTime(2026, 2, 17, 9, 0)))
        val badTime = reminder(time = "8:00")
        assertNull(ReminderSchedule.nextOccurrence(badTime, LocalDateTime(2026, 2, 17, 9, 0)))
    }

    private fun reminder(
        weekdays: List<Int> = listOf(0, 1, 2, 3, 4, 5, 6),
        time: String = "08:00",
        enabled: Boolean = true,
    ) = Reminder(
        id = "r1",
        userId = "u1",
        kind = Reminder.Kind.weight,
        mealType = null,
        time = time,
        weekdays = weekdays,
        enabled = enabled,
    )
}
