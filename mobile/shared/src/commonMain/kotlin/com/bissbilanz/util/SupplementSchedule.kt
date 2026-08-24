package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Supplement
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.daysUntil

/**
 * Schedule maths shared by the supplement history screen and the reminder scheduler.
 * Mirrors `src/lib/utils/supplements.ts` on the web and
 * `iosApp/PhoneShared/Utilities/SupplementSchedule.swift` on iOS — the three must agree.
 */
object SupplementSchedule {
    /** How far ahead [nextOccurrence] will look before giving up. */
    const val DEFAULT_HORIZON_DAYS = 60

    /**
     * Determine if a supplement is due on a given date.
     *
     * [scheduleDays] uses the server's Sun=0..Sat=6 numbering, so the ISO Mon=1..Sun=7
     * of [LocalDate.dayOfWeek] is rotated with `% 7`.
     */
    fun isSupplementDue(
        scheduleType: Supplement.ScheduleType,
        scheduleDays: List<Int>?,
        scheduleStartDate: String?,
        date: LocalDate,
    ): Boolean =
        when (scheduleType) {
            Supplement.ScheduleType.daily -> true

            Supplement.ScheduleType.every_other_day -> {
                val start = scheduleStartDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                if (start == null) true else start.daysUntil(date) % 2 == 0
            }

            Supplement.ScheduleType.weekly, Supplement.ScheduleType.specific_days -> {
                if (scheduleDays.isNullOrEmpty()) false else scheduleDays.contains(date.dayOfWeek.value % 7)
            }
        }

    fun isDueOn(
        supplement: Supplement,
        date: LocalDate,
    ): Boolean =
        isSupplementDue(
            supplement.scheduleType,
            supplement.scheduleDays,
            supplement.scheduleStartDate,
            date,
        )

    /**
     * Strictly parse an `HH:MM` wall-clock reminder time. Returns null on anything else so a
     * corrupted server value degrades to "no reminder" instead of crashing the scheduler.
     */
    fun parseReminderTime(hhmm: String): LocalTime? {
        if (hhmm.length != 5 || hhmm[2] != ':') return null
        val hour = hhmm.substring(0, 2).toIntOrNull() ?: return null
        val minute = hhmm.substring(3, 5).toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) return null
        return LocalTime(hour, minute)
    }

    /**
     * The first due-day occurrence of [hhmm] strictly after [from], or null when the supplement
     * is inactive, the time is unparseable, or nothing falls inside [horizonDays] (an empty
     * `scheduleDays` on a weekly schedule is never due).
     */
    fun nextOccurrence(
        supplement: Supplement,
        hhmm: String,
        from: LocalDateTime,
        horizonDays: Int = DEFAULT_HORIZON_DAYS,
    ): LocalDateTime? {
        if (!supplement.isActive) return null
        val time = parseReminderTime(hhmm) ?: return null
        var day = from.date
        repeat(horizonDays + 1) {
            if (isDueOn(supplement, day)) {
                val candidate = LocalDateTime(day, time)
                if (candidate > from) return candidate
            }
            day = day.plusDays(1)
        }
        return null
    }

    /**
     * Every due-day occurrence of [hhmm] in `[from, from + windowDays)`, ascending. Used by the
     * iOS-style rolling window; Android arms only [nextOccurrence].
     */
    fun occurrences(
        supplement: Supplement,
        hhmm: String,
        from: LocalDateTime,
        windowDays: Int,
    ): List<LocalDateTime> {
        if (!supplement.isActive) return emptyList()
        val time = parseReminderTime(hhmm) ?: return emptyList()
        val result = mutableListOf<LocalDateTime>()
        var day = from.date
        repeat(windowDays) {
            if (isDueOn(supplement, day)) {
                val candidate = LocalDateTime(day, time)
                if (candidate > from) result.add(candidate)
            }
            day = day.plusDays(1)
        }
        return result
    }
}

private fun LocalDate.plusDays(days: Int): LocalDate = LocalDate.fromEpochDays(toEpochDays() + days)
