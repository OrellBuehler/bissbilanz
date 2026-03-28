package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CaffeineSleepTest {
    @Test
    fun emptyDataReturnsEmpty() {
        val result = computeCaffeineSleepCutoff(emptyList(), emptyList())
        assertNull(result.estimatedCutoffHour)
        assertEquals(0, result.sampleSize)
        assertEquals(emptyList(), result.hourlyImpact)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun hourlyBucketingTracksLastHourPerDay() {
        val caffeineEntries = listOf(
            CaffeineEntry(date = "2024-01-01", eatenAt = "2024-01-01T08:00:00Z", caffeine = 100.0),
            CaffeineEntry(date = "2024-01-01", eatenAt = "2024-01-01T14:00:00Z", caffeine = 80.0),
            CaffeineEntry(date = "2024-01-02", eatenAt = "2024-01-02T09:00:00Z", caffeine = 100.0),
        )
        val sleepData = listOf(
            SleepDataPoint(date = "2024-01-02", sleepQuality = 7.0, sleepDurationMinutes = 420.0),
            SleepDataPoint(date = "2024-01-03", sleepQuality = 8.0, sleepDurationMinutes = 450.0),
        )
        val result = computeCaffeineSleepCutoff(caffeineEntries, sleepData)
        // 2024-01-01 last caffeine at hour 14, sleep on 2024-01-02
        // 2024-01-02 last caffeine at hour 9, sleep on 2024-01-03
        assertEquals(2, result.hourlyImpact.size)
        val hour14 = result.hourlyImpact.find { it.hour == 14 }
        assertNotNull(hour14)
        assertEquals(7.0, hour14.avgQuality)
        val hour9 = result.hourlyImpact.find { it.hour == 9 }
        assertNotNull(hour9)
        assertEquals(8.0, hour9.avgQuality)
    }

    @Test
    fun cutoffDetectedWhenClearQualityDifference() {
        // Hours 8-11 (before cutoff 12): high quality sleep
        // Hours 16-19 (after cutoff 12): low quality sleep
        val caffeineEntries = mutableListOf<CaffeineEntry>()
        val sleepData = mutableListOf<SleepDataPoint>()
        val baseDate = "2024-01"
        // 5 days with early caffeine (hour 8-11) -> good sleep
        for (i in 1..5) {
            val date = "$baseDate-%02d".format(i)
            val nextDate = "$baseDate-%02d".format(i + 1)
            caffeineEntries.add(CaffeineEntry(date = date, eatenAt = "${date}T08:00:00Z", caffeine = 100.0))
            sleepData.add(SleepDataPoint(date = nextDate, sleepQuality = 9.0, sleepDurationMinutes = 480.0))
        }
        // 5 days with late caffeine (hour 18-19) -> poor sleep
        for (i in 10..14) {
            val date = "$baseDate-%02d".format(i)
            val nextDate = "$baseDate-%02d".format(i + 1)
            caffeineEntries.add(CaffeineEntry(date = date, eatenAt = "${date}T18:00:00Z", caffeine = 100.0))
            sleepData.add(SleepDataPoint(date = nextDate, sleepQuality = 4.0, sleepDurationMinutes = 360.0))
        }
        val result = computeCaffeineSleepCutoff(caffeineEntries, sleepData)
        assertNotNull(result.estimatedCutoffHour)
    }

    @Test
    fun missingSleepdataIsSkipped() {
        val caffeineEntries = listOf(
            CaffeineEntry(date = "2024-01-01", eatenAt = "2024-01-01T14:00:00Z", caffeine = 100.0),
        )
        // No sleep data for 2024-01-02 (the next date)
        val sleepData = listOf(
            SleepDataPoint(date = "2024-01-05", sleepQuality = 8.0, sleepDurationMinutes = 450.0),
        )
        val result = computeCaffeineSleepCutoff(caffeineEntries, sleepData)
        assertEquals(0, result.sampleSize)
        assertEquals(emptyList(), result.hourlyImpact)
    }
}
