package com.bissbilanz.android.reminders

import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.util.SupplementSchedule
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Instant

/**
 * The reminder times are local wall-clock "HH:MM" strings, so every question of when an
 * alarm goes off is answered in the device's current zone at the moment of arming.
 */
class ReminderAlarmsTest {
    private val zurich = TimeZone.of("Europe/Zurich")
    private val newYork = TimeZone.of("America/New_York")

    private fun supplement(isActive: Boolean = true) =
        Supplement(
            id = "s1",
            userId = "u1",
            name = "Vitamin D",
            scheduleType = Supplement.ScheduleType.daily,
            scheduleDays = null,
            scheduleStartDate = null,
            isActive = isActive,
            sortOrder = 0,
            timeOfDay = null,
            reminderTimes = listOf("08:00"),
            ingredients = emptyList(),
        )

    private fun nextTrigger(
        now: String,
        zone: TimeZone,
        hhmm: String = "08:00",
    ): ReminderTrigger? {
        val local = Instant.parse(now).toLocalDateTime(zone)
        val next = SupplementSchedule.nextOccurrence(supplement(), hhmm, local) ?: return null
        return ReminderAlarms.trigger(next, zone)
    }

    private fun millis(instant: String) = Instant.parse(instant).toEpochMilliseconds()

    @Test
    fun aTimeStillAheadTodayFiresToday() {
        val trigger = assertNotNull(nextTrigger("2026-10-04T05:59:00Z", zurich))

        assertEquals(millis("2026-10-04T06:00:00Z"), trigger.atMillis)
        assertEquals(LocalDate(2026, 10, 4), trigger.date)
    }

    @Test
    fun aTimeThatJustPassedRollsToTomorrow() {
        val trigger = assertNotNull(nextTrigger("2026-10-04T06:00:00Z", zurich))

        assertEquals(millis("2026-10-05T06:00:00Z"), trigger.atMillis)
        assertEquals(LocalDate(2026, 10, 5), trigger.date)
    }

    @Test
    fun theSameInstantMeansADifferentDayInAnotherZone() {
        val now = "2026-10-04T23:30:00Z"

        val inZurich = assertNotNull(nextTrigger(now, zurich))
        val inNewYork = assertNotNull(nextTrigger(now, newYork))

        // 01:30 on the 5th in Zurich: 08:00 is later that day. 19:30 on the 4th in New
        // York: 08:00 is tomorrow.
        assertEquals(LocalDate(2026, 10, 5), inZurich.date)
        assertEquals(millis("2026-10-05T06:00:00Z"), inZurich.atMillis)
        assertEquals(LocalDate(2026, 10, 5), inNewYork.date)
        assertEquals(millis("2026-10-05T12:00:00Z"), inNewYork.atMillis)
    }

    @Test
    fun theOccurrenceDateIsTheLocalDateNotTheUtcDate() {
        val trigger = assertNotNull(nextTrigger("2026-10-04T12:00:00Z", zurich, "00:30"))

        assertEquals(millis("2026-10-04T22:30:00Z"), trigger.atMillis)
        assertEquals(LocalDate(2026, 10, 5), trigger.date)
    }

    @Test
    fun aTimeThatDoesNotExistOnASpringForwardDayStillFiresThatDay() {
        val trigger = ReminderAlarms.trigger(LocalDateTime(2026, 3, 29, 2, 30), zurich)

        // 02:30 was skipped (02:00 jumped to 03:00): it resolves forward to 03:30 CEST.
        assertEquals(millis("2026-03-29T01:30:00Z"), trigger.atMillis)
        assertEquals(LocalDate(2026, 3, 29), trigger.date)
    }

    @Test
    fun anAmbiguousTimeOnAFallBackDayFiresOnce_atTheFirstOccurrence() {
        val trigger = ReminderAlarms.trigger(LocalDateTime(2026, 10, 25, 2, 30), zurich)

        // 02:30 happens twice (CEST, then CET); the earlier one wins.
        assertEquals(millis("2026-10-25T00:30:00Z"), trigger.atMillis)
    }

    @Test
    fun theWallClockTimeHoldsAcrossTheOffsetChange() {
        val beforeFallBack = ReminderAlarms.trigger(LocalDateTime(2026, 10, 24, 8, 0), zurich)
        val afterFallBack = ReminderAlarms.trigger(LocalDateTime(2026, 10, 26, 8, 0), zurich)

        assertEquals(millis("2026-10-24T06:00:00Z"), beforeFallBack.atMillis)
        assertEquals(millis("2026-10-26T07:00:00Z"), afterFallBack.atMillis)
    }

    @Test
    fun anInactiveSupplementHasNoTrigger() {
        val local = Instant.parse("2026-10-04T05:00:00Z").toLocalDateTime(zurich)

        assertEquals(null, SupplementSchedule.nextOccurrence(supplement(isActive = false), "08:00", local))
    }

    @Test
    fun exactAlarmsNeedNoAccessBeforeAndroid12() {
        assertTrue(ReminderAlarms.shouldUseExact(sdkInt = 30, exactAccessGranted = false))
        assertTrue(ReminderAlarms.shouldUseExact(sdkInt = 26, exactAccessGranted = false))
    }

    @Test
    fun fromAndroid12OnExactAlarmsFollowTheUsersAccessSetting() {
        assertTrue(ReminderAlarms.shouldUseExact(sdkInt = 31, exactAccessGranted = true))
        assertTrue(ReminderAlarms.shouldUseExact(sdkInt = 35, exactAccessGranted = true))
        assertFalse(ReminderAlarms.shouldUseExact(sdkInt = 31, exactAccessGranted = false))
        assertFalse(ReminderAlarms.shouldUseExact(sdkInt = 35, exactAccessGranted = false))
    }
}
