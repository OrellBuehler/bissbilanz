package com.bissbilanz.android.util

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.time.Instant

class SleepTimesTest {
    private val zone = TimeZone.of("Europe/Zurich")
    private val date = LocalDate(2026, 10, 20)

    @Test
    fun eveningBedtimeIsOnThePreviousDay() {
        val times = resolveSleepTimes(date, LocalTime(23, 0), LocalTime(7, 0), zone)
        assertEquals(Instant.parse("2026-10-19T21:00:00Z"), times.bedtime)
        assertEquals(Instant.parse("2026-10-20T05:00:00Z"), times.wakeTime)
        assertEquals(480, times.durationMinutes)
    }

    @Test
    fun afterMidnightBedtimeIsOnTheWakeDate() {
        val times = resolveSleepTimes(date, LocalTime(0, 30), LocalTime(7, 0), zone)
        assertEquals(Instant.parse("2026-10-19T22:30:00Z"), times.bedtime)
        assertEquals(390, times.durationMinutes)
    }

    @Test
    fun napOnTheSameDayStaysOnTheWakeDate() {
        val times = resolveSleepTimes(date, LocalTime(13, 0), LocalTime(14, 30), zone)
        assertEquals(Instant.parse("2026-10-20T11:00:00Z"), times.bedtime)
        assertEquals(90, times.durationMinutes)
    }

    @Test
    fun durationFollowsTheClockChange() {
        // Night of the switch back to winter time in Zurich: 23:00 → 07:00 is nine hours.
        val times = resolveSleepTimes(LocalDate(2026, 10, 25), LocalTime(23, 0), LocalTime(7, 0), zone)
        assertEquals(540, times.durationMinutes)
    }

    @Test
    fun unchangedEditKeepsTheOriginalInstants() {
        val original =
            SleepTimes(
                bedtime = Instant.parse("2026-10-19T22:31:17Z"),
                wakeTime = Instant.parse("2026-10-20T05:02:45Z"),
            )
        val times =
            resolveSleepTimes(
                date,
                LocalTime(0, 31, 17),
                LocalTime(7, 2, 45),
                zone,
                original = original,
                originalEntryDate = date,
            )
        assertSame(original, times)
    }

    @Test
    fun changedTimeRebuildsBothInstants() {
        val original =
            SleepTimes(
                bedtime = Instant.parse("2026-10-19T22:30:00Z"),
                wakeTime = Instant.parse("2026-10-20T05:00:00Z"),
            )
        val times =
            resolveSleepTimes(
                date,
                LocalTime(0, 30),
                LocalTime(7, 30),
                zone,
                original = original,
                originalEntryDate = date,
            )
        assertEquals(Instant.parse("2026-10-19T22:30:00Z"), times.bedtime)
        assertEquals(Instant.parse("2026-10-20T05:30:00Z"), times.wakeTime)
    }

    @Test
    fun changedDateMovesTheNight() {
        val original =
            SleepTimes(
                bedtime = Instant.parse("2026-10-19T21:00:00Z"),
                wakeTime = Instant.parse("2026-10-20T05:00:00Z"),
            )
        val times =
            resolveSleepTimes(
                LocalDate(2026, 10, 21),
                LocalTime(23, 0),
                LocalTime(7, 0),
                zone,
                original = original,
                originalEntryDate = date,
            )
        assertEquals(Instant.parse("2026-10-20T21:00:00Z"), times.bedtime)
        assertEquals(Instant.parse("2026-10-21T05:00:00Z"), times.wakeTime)
    }
}
