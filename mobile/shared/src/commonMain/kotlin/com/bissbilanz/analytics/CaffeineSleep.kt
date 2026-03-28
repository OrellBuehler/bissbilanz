package com.bissbilanz.analytics

import kotlin.math.max

data class HourlyImpact(
    val hour: Int,
    val avgQuality: Double,
    val avgDuration: Double,
    val count: Int,
)

data class CaffeineSleepResult(
    val estimatedCutoffHour: Int?,
    val hourlyImpact: List<HourlyImpact>,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class CaffeineEntry(
    val date: String,
    val eatenAt: String?,
    val caffeine: Double,
)

data class SleepDataPoint(
    val date: String,
    val sleepQuality: Double?,
    val sleepDurationMinutes: Double?,
)

fun computeCaffeineSleepCutoff(
    caffeineEntries: List<CaffeineEntry>,
    sleepData: List<SleepDataPoint>,
): CaffeineSleepResult {
    val sleepByDate = mutableMapOf<String, Pair<Double, Double>>()
    for (s in sleepData) {
        if (s.sleepQuality != null && s.sleepDurationMinutes != null)
            sleepByDate[s.date] = Pair(s.sleepQuality, s.sleepDurationMinutes)
    }

    val lastCaffeineHourByDate = mutableMapOf<String, Int>()
    for (entry in caffeineEntries) {
        if (entry.eatenAt == null || entry.caffeine <= 0) continue
        val hour = entry.eatenAt.substring(11, 13).toIntOrNull() ?: continue
        val existing = lastCaffeineHourByDate[entry.date]
        if (existing == null || hour > existing) lastCaffeineHourByDate[entry.date] = hour
    }

    val hourBuckets = mutableMapOf<Int, Pair<MutableList<Double>, MutableList<Double>>>()
    for ((date, lastHour) in lastCaffeineHourByDate) {
        val nextDate = shiftDate(date, 1)
        val sleep = sleepByDate[nextDate] ?: continue
        val bucket = hourBuckets.getOrPut(lastHour) { Pair(mutableListOf(), mutableListOf()) }
        bucket.first.add(sleep.first)
        bucket.second.add(sleep.second)
    }

    val hourlyImpact = hourBuckets.entries.sortedBy { it.key }.map { (hour, pair) ->
        val quality = pair.first
        val duration = pair.second
        HourlyImpact(
            hour = hour,
            avgQuality = quality.sum() / quality.size,
            avgDuration = duration.sum() / duration.size,
            count = quality.size,
        )
    }

    val sampleSize = hourlyImpact.sumOf { it.count }

    var estimatedCutoffHour: Int? = null
    var bestDelta = 0.0
    for (candidate in 12..20) {
        val before = hourlyImpact.filter { it.hour < candidate && it.count >= 1 }
        val after = hourlyImpact.filter { it.hour >= candidate && it.count >= 1 }
        val beforeCount = before.sumOf { it.count }
        val afterCount = after.sumOf { it.count }
        if (beforeCount < 3 || afterCount < 3) continue
        val beforeQuality = before.sumOf { it.avgQuality * it.count } / beforeCount
        val afterQuality = after.sumOf { it.avgQuality * it.count } / afterCount
        val delta = beforeQuality - afterQuality
        if (delta > 0.5 && delta > bestDelta) {
            bestDelta = delta
            estimatedCutoffHour = candidate
        }
    }

    return CaffeineSleepResult(
        estimatedCutoffHour = estimatedCutoffHour,
        hourlyImpact = hourlyImpact,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
