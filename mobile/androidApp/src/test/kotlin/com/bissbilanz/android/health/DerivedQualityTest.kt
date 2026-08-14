package com.bissbilanz.android.health

import androidx.health.connect.client.records.SleepSessionRecord
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DerivedQualityTest {
    private val base: Instant = Instant.parse("2026-08-15T23:00:00Z")

    private fun stage(
        type: Int,
        fromMinute: Long,
        toMinute: Long,
    ) = SleepSessionRecord.Stage(
        startTime = base.plusSeconds(fromMinute * 60),
        endTime = base.plusSeconds(toMinute * 60),
        stage = type,
    )

    @Test
    fun `a full efficient night scores near the top`() {
        val quality = derivedQuality(asleepMinutes = 480, totalMinutes = 480, stages = emptyList())
        assertEquals(10.0, quality)
    }

    @Test
    fun `a short restless night scores low`() {
        val quality = derivedQuality(asleepMinutes = 120, totalMinutes = 300, stages = emptyList())
        assertTrue(quality < 5.0, "expected a low score, got $quality")
    }

    @Test
    fun `the score always lands inside the 1 to 10 the app expects`() {
        val cases =
            listOf(
                Triple(0, 0, emptyList<SleepSessionRecord.Stage>()),
                Triple(0, 600, emptyList()),
                Triple(1200, 1200, emptyList()),
            )
        cases.forEach { (asleep, total, stages) ->
            val quality = derivedQuality(asleep, total, stages)
            assertTrue(quality in 1.0..10.0, "quality $quality out of range for $asleep/$total")
        }
    }

    @Test
    fun `restorative stages lift an otherwise identical night`() {
        val without = derivedQuality(asleepMinutes = 360, totalMinutes = 420, stages = emptyList())
        val with =
            derivedQuality(
                asleepMinutes = 360,
                totalMinutes = 420,
                stages =
                    listOf(
                        stage(SleepSessionRecord.STAGE_TYPE_DEEP, 0, 90),
                        stage(SleepSessionRecord.STAGE_TYPE_REM, 90, 180),
                    ),
            )
        assertTrue(with >= without, "restorative stages should not lower the score ($with vs $without)")
    }

    @Test
    fun `a zero-length session falls back to the neutral midpoint`() {
        assertEquals(5.0, derivedQuality(asleepMinutes = 0, totalMinutes = 0, stages = emptyList()))
    }
}
