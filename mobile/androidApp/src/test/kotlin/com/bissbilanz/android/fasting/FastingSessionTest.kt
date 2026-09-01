package com.bissbilanz.android.fasting

import com.bissbilanz.android.ui.screens.formatElapsed
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class FastingSessionTest {
    private val start = Instant.parse("2026-08-15T08:00:00Z")

    private fun session(
        targetHours: Int = 16,
        endedAfter: kotlin.time.Duration? = null,
    ) = FastingSession(
        id = "test",
        startedAtEpochMs = start.toEpochMilliseconds(),
        targetHours = targetHours,
        endedAtEpochMs = endedAfter?.let { (start + it).toEpochMilliseconds() },
    )

    @Test
    fun `progress is fractional before the target`() {
        assertEquals(0.5f, session().progress(start + 8.hours))
    }

    @Test
    fun `progress clamps at the target instead of overflowing`() {
        assertEquals(1f, session().progress(start + 30.hours))
    }

    @Test
    fun `progress does not divide by zero for a malformed zero-hour session`() {
        // Floors the denominator at a minute rather than producing NaN/Infinity.
        assertEquals(1f, session(targetHours = 0).progress(start + 1.hours))
    }

    @Test
    fun `elapsed never goes negative when the clock moves backwards`() {
        assertEquals(kotlin.time.Duration.ZERO, session().elapsed(start - 2.hours))
    }

    @Test
    fun `target end is the start plus the target`() {
        assertEquals(start + 16.hours, session().targetEnd)
    }

    @Test
    fun `reachedTarget reflects the completed duration`() {
        assertTrue(session(endedAfter = 16.hours).reachedTarget)
        assertFalse(session(endedAfter = 15.hours + 59.minutes).reachedTarget)
    }

    @Test
    fun `a running session has no duration and has not reached its target`() {
        assertEquals(null, session().duration)
        assertFalse(session().reachedTarget)
    }

    @Test
    fun `round-trips through JSON`() {
        // Exercises the generated serializer FastingSessionStore depends on —
        // it only exists when androidApp applies the kotlinx.serialization
        // plugin, so this fails with "Serializer for class 'FastingSession' is
        // not found" (the shipped start-fast crash) if the plugin is dropped.
        val original = session(endedAfter = 16.hours)
        val json = Json.encodeToString(original)
        assertEquals(original, Json.decodeFromString<FastingSession>(json))
    }

    @Test
    fun `elapsed renders as h mm ss`() {
        assertEquals("0:00:00", formatElapsed(kotlin.time.Duration.ZERO))
        assertEquals("1:05:09", formatElapsed(1.hours + 5.minutes + 9.seconds))
        assertEquals("18:00:00", formatElapsed(18.hours))
    }
}
