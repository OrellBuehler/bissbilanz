package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Supplement
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Ported case-for-case from `tests/utils/supplements.test.ts` — the web copy of this logic is
 * the reference implementation, and the two must never drift.
 */
class SupplementScheduleTest {
    private fun date(iso: String) = LocalDate.parse(iso)

    @Test
    fun dailyIsAlwaysDue() {
        assertTrue(SupplementSchedule.isSupplementDue(Supplement.ScheduleType.daily, null, null, date("2026-02-17")))
        assertTrue(SupplementSchedule.isSupplementDue(Supplement.ScheduleType.daily, null, null, date("2026-02-18")))
    }

    @Test
    fun everyOtherDayIsDueOnEvenDaysFromStart() {
        val start = "2026-02-01"
        val type = Supplement.ScheduleType.every_other_day
        assertTrue(SupplementSchedule.isSupplementDue(type, null, start, date("2026-02-01")))
        assertFalse(SupplementSchedule.isSupplementDue(type, null, start, date("2026-02-02")))
        assertTrue(SupplementSchedule.isSupplementDue(type, null, start, date("2026-02-03")))
    }

    @Test
    fun everyOtherDayDefaultsToDueWithoutStartDate() {
        val type = Supplement.ScheduleType.every_other_day
        assertTrue(SupplementSchedule.isSupplementDue(type, null, null, date("2026-02-17")))
    }

    @Test
    fun everyOtherDayTreatsAnUnparseableStartDateAsNoStartDate() {
        val type = Supplement.ScheduleType.every_other_day
        assertTrue(SupplementSchedule.isSupplementDue(type, null, "not-a-date", date("2026-02-17")))
    }

    @Test
    fun weeklyIsDueOnMatchingDayOfWeek() {
        // 2026-02-17 is a Tuesday -> server day 2
        val type = Supplement.ScheduleType.weekly
        assertTrue(SupplementSchedule.isSupplementDue(type, listOf(2), null, date("2026-02-17")))
        assertFalse(SupplementSchedule.isSupplementDue(type, listOf(1), null, date("2026-02-17")))
    }

    @Test
    fun specificDaysIsDueOnMatchingDays() {
        val type = Supplement.ScheduleType.specific_days
        val monWedFri = listOf(1, 3, 5)
        // Tuesday -> not in list
        assertFalse(SupplementSchedule.isSupplementDue(type, monWedFri, null, date("2026-02-17")))
        // Wednesday -> in list
        assertTrue(SupplementSchedule.isSupplementDue(type, monWedFri, null, date("2026-02-18")))
    }

    @Test
    fun sundayMapsToDayZero() {
        // 2026-02-22 is a Sunday; ISO gives it 7, the server numbering gives it 0.
        val type = Supplement.ScheduleType.specific_days
        assertTrue(SupplementSchedule.isSupplementDue(type, listOf(0), null, date("2026-02-22")))
        assertFalse(SupplementSchedule.isSupplementDue(type, listOf(7), null, date("2026-02-22")))
    }

    @Test
    fun specificDaysIsNeverDueWithoutDays() {
        val type = Supplement.ScheduleType.specific_days
        assertFalse(SupplementSchedule.isSupplementDue(type, emptyList(), null, date("2026-02-17")))
        assertFalse(SupplementSchedule.isSupplementDue(type, null, null, date("2026-02-17")))
    }

    @Test
    fun parseReminderTimeAcceptsWellFormedTimes() {
        assertEquals(LocalTime(8, 0), SupplementSchedule.parseReminderTime("08:00"))
        assertEquals(LocalTime(0, 0), SupplementSchedule.parseReminderTime("00:00"))
        assertEquals(LocalTime(23, 59), SupplementSchedule.parseReminderTime("23:59"))
    }

    @Test
    fun parseReminderTimeRejectsAnythingElse() {
        for (bad in listOf("8:00", "24:00", "08:60", "08:00:00", "", "0800", "ab:cd", "08-00")) {
            assertNull(SupplementSchedule.parseReminderTime(bad), "expected null for \"$bad\"")
        }
    }

    @Test
    fun nextOccurrenceSkipsToTheNextDueDay() {
        // Tuesday 2026-02-17 09:00, supplement due Mon/Wed/Fri -> next is Wednesday 08:00
        val supplement = supplement(Supplement.ScheduleType.specific_days, scheduleDays = listOf(1, 3, 5))
        val next = SupplementSchedule.nextOccurrence(supplement, "08:00", LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 18, 8, 0), next)
    }

    @Test
    fun nextOccurrenceRollsToTomorrowWhenTodaysTimeHasPassed() {
        val supplement = supplement(Supplement.ScheduleType.daily)
        val next = SupplementSchedule.nextOccurrence(supplement, "08:00", LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 18, 8, 0), next)
    }

    @Test
    fun nextOccurrenceKeepsTodayWhenTheTimeIsStillAhead() {
        val supplement = supplement(Supplement.ScheduleType.daily)
        val next = SupplementSchedule.nextOccurrence(supplement, "20:00", LocalDateTime(2026, 2, 17, 9, 0))
        assertEquals(LocalDateTime(2026, 2, 17, 20, 0), next)
    }

    @Test
    fun nextOccurrenceIsNullForANeverDueSupplement() {
        val supplement = supplement(Supplement.ScheduleType.specific_days, scheduleDays = emptyList())
        assertNull(SupplementSchedule.nextOccurrence(supplement, "08:00", LocalDateTime(2026, 2, 17, 9, 0)))
    }

    @Test
    fun nextOccurrenceIsNullForInactiveSupplementsAndBadTimes() {
        val inactive = supplement(Supplement.ScheduleType.daily, isActive = false)
        assertNull(SupplementSchedule.nextOccurrence(inactive, "08:00", LocalDateTime(2026, 2, 17, 9, 0)))
        val active = supplement(Supplement.ScheduleType.daily)
        assertNull(SupplementSchedule.nextOccurrence(active, "8:00", LocalDateTime(2026, 2, 17, 9, 0)))
    }

    @Test
    fun occurrencesEnumeratesTheWindowAscending() {
        val supplement = supplement(Supplement.ScheduleType.every_other_day, scheduleStartDate = "2026-02-01")
        val found = SupplementSchedule.occurrences(supplement, "08:00", LocalDateTime(2026, 2, 17, 0, 0), windowDays = 5)
        // Feb 1 is day 0, so odd-numbered February dates are due.
        assertEquals(
            listOf(
                LocalDateTime(2026, 2, 17, 8, 0),
                LocalDateTime(2026, 2, 19, 8, 0),
                LocalDateTime(2026, 2, 21, 8, 0),
            ),
            found,
        )
    }

    @Test
    fun occurrencesExcludesTimesAlreadyPast() {
        val supplement = supplement(Supplement.ScheduleType.daily)
        val found = SupplementSchedule.occurrences(supplement, "08:00", LocalDateTime(2026, 2, 17, 9, 0), windowDays = 2)
        assertEquals(listOf(LocalDateTime(2026, 2, 18, 8, 0)), found)
    }

    private fun supplement(
        scheduleType: Supplement.ScheduleType,
        scheduleDays: List<Int>? = null,
        scheduleStartDate: String? = null,
        isActive: Boolean = true,
    ) = Supplement(
        id = "s1",
        userId = "u1",
        name = "Vitamin D",
        scheduleType = scheduleType,
        scheduleDays = scheduleDays,
        scheduleStartDate = scheduleStartDate,
        isActive = isActive,
        sortOrder = 0,
        timeOfDay = null,
        ingredients = emptyList(),
    )
}
