package com.bissbilanz.analytics

import kotlinx.datetime.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EatenAtOnDateTest {
    private val zurich = TimeZone.of("Europe/Zurich")

    @Test
    fun keepsLocalTimeOnTheTargetDay() {
        assertEquals(
            "2026-03-21T08:30:00Z",
            eatenAtOnDate("2026-03-20T08:30:00Z", "2026-03-21", TimeZone.UTC),
        )
    }

    @Test
    fun keepsWallClockTimeAcrossSpringForward() {
        assertEquals("2026-04-02T06:30:00Z", eatenAtOnDate("2026-03-20T07:30:00Z", "2026-04-02", zurich))
    }

    @Test
    fun keepsWallClockTimeAcrossFallBack() {
        assertEquals("2026-11-05T07:30:00Z", eatenAtOnDate("2026-10-20T06:30:00Z", "2026-11-05", zurich))
    }

    @Test
    fun movesBackwardsToo() {
        assertEquals("2026-03-05T22:45:00Z", eatenAtOnDate("2026-04-02T21:45:00Z", "2026-03-05", zurich))
    }

    @Test
    fun nullStaysNull() {
        assertNull(eatenAtOnDate(null, "2026-03-21", zurich))
    }
}
