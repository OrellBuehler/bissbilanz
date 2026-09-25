package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Reminder
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.isoDayNumber

/**
 * Schedule maths for general logging reminders (weight / meal / sleep). Mirrors
 * `dueGeneralReminders` in `src/lib/server/push/reminders.ts` on the web — the two must
 * agree. [weekdays] uses the same Sun=0..Sat=6 numbering as [SupplementSchedule], via
 * `isoDayNumber % 7`.
 */
object ReminderSchedule {
    /** How far ahead [nextOccurrence] will look before giving up. */
    const val DEFAULT_HORIZON_DAYS = 60

    fun isDueOn(
        weekdays: List<Int>,
        date: LocalDate,
    ): Boolean = weekdays.contains(date.dayOfWeek.isoDayNumber % 7)

    fun isDueOn(
        reminder: Reminder,
        date: LocalDate,
    ): Boolean = isDueOn(reminder.weekdays, date)

    /**
     * The first due-day occurrence of [reminder]'s time strictly after [from], or null
     * when the reminder is disabled, its time is unparseable, or nothing falls inside
     * [horizonDays].
     */
    fun nextOccurrence(
        reminder: Reminder,
        from: LocalDateTime,
        horizonDays: Int = DEFAULT_HORIZON_DAYS,
    ): LocalDateTime? {
        if (!reminder.enabled) return null
        val time = SupplementSchedule.parseReminderTime(reminder.time) ?: return null
        var day = from.date
        repeat(horizonDays + 1) {
            if (isDueOn(reminder.weekdays, day)) {
                val candidate = LocalDateTime(day, time)
                if (candidate > from) return candidate
            }
            day = day.plusDays(1)
        }
        return null
    }
}

private fun LocalDate.plusDays(days: Int): LocalDate = LocalDate.fromEpochDays(toEpochDays() + days)
