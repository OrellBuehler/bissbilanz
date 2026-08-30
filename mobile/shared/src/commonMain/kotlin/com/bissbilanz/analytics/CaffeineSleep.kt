package com.bissbilanz.analytics

import kotlin.math.min

data class HourlyImpact(
    val hour: Int,
    val avgQuality: Double,
    val avgDuration: Double,
    val count: Int,
)

data class CaffeineSleepResult(
    /** A personal cutoff, only when the split survives a multiplicity-corrected test. */
    val estimatedCutoffHour: Int?,
    /** Literature default to fall back on (~9 h before a 23:00 bedtime; Drake 2013, Gardiner 2023). */
    val defaultCutoffHour: Int,
    /** Bonferroni-corrected p-value of the best split, null when nothing was testable. */
    val pValue: Double?,
    /** Number of candidate cutoffs that had enough nights on both sides to test. */
    val comparisons: Int,
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

private const val MIN_NIGHTS_PER_SIDE = 5
private const val MIN_QUALITY_DELTA = 0.5
private const val SIGNIFICANCE = 0.05

/**
 * Buckets nights by the hour of the day's last caffeine and scans cutoffs
 * 12:00–20:00 for the split with the strongest quality drop. Nine candidate
 * split points searched for a maximum is a maximally-selected statistic, so the
 * winner's Welch p-value is Bonferroni-corrected over the candidates that were
 * actually testable before it may replace the literature default.
 */
fun computeCaffeineSleepCutoff(
    caffeineEntries: List<CaffeineEntry>,
    sleepData: List<SleepDataPoint>,
    timeZone: String,
): CaffeineSleepResult {
    val sleepByDate = mutableMapOf<String, Pair<Double, Double>>()
    for (s in sleepData) {
        if (s.sleepQuality != null && s.sleepDurationMinutes != null) {
            sleepByDate[s.date] = Pair(s.sleepQuality, s.sleepDurationMinutes)
        }
    }

    val lastCaffeineHourByDate = mutableMapOf<String, Int>()
    for (entry in caffeineEntries) {
        if (entry.eatenAt == null || entry.caffeine <= 0) continue
        val localMinutes = localMinutesOfDay(entry.eatenAt, timeZone) ?: continue
        val hour = localMinutes / 60
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

    val sortedBuckets = hourBuckets.entries.sortedBy { it.key }
    val hourlyImpact =
        sortedBuckets.map { (hour, pair) ->
            HourlyImpact(
                hour = hour,
                avgQuality = mean(pair.first),
                avgDuration = mean(pair.second),
                count = pair.first.size,
            )
        }

    val sampleSize = hourlyImpact.sumOf { it.count }

    var comparisons = 0
    var bestCandidate: Int? = null
    var bestP = 1.0
    for (candidate in 12..20) {
        val before = sortedBuckets.filter { it.key < candidate }.flatMap { it.value.first }
        val after = sortedBuckets.filter { it.key >= candidate }.flatMap { it.value.first }
        if (before.size < MIN_NIGHTS_PER_SIDE || after.size < MIN_NIGHTS_PER_SIDE) continue
        comparisons++
        val delta = mean(before) - mean(after)
        if (delta <= MIN_QUALITY_DELTA) continue
        val pValue = welchTTest(before, after).pValue
        if (pValue < bestP) {
            bestP = pValue
            bestCandidate = candidate
        }
    }

    val correctedP = if (comparisons > 0) min(1.0, bestP * comparisons) else null
    val estimatedCutoffHour =
        if (bestCandidate != null && correctedP != null && correctedP < SIGNIFICANCE) bestCandidate else null

    return CaffeineSleepResult(
        estimatedCutoffHour = estimatedCutoffHour,
        defaultCutoffHour = DEFAULT_CAFFEINE_CUTOFF_HOUR,
        pValue = correctedP,
        comparisons = comparisons,
        hourlyImpact = hourlyImpact,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
