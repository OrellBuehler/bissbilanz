package com.bissbilanz.analytics

import kotlin.math.sqrt

data class FrontLoadingResult(
    val avgMorningPct: Double,
    val daysAbove50Pct: Int,
    val totalDays: Int,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class CalorieCyclingResult(
    val mean: Double,
    val stddev: Double,
    val cv: Double,
    val pattern: String,
    val highDays: Int,
    val lowDays: Int,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

private fun parseHour(eatenAt: String): Int = eatenAt.substring(11, 13).toIntOrNull() ?: 0

fun computeCalorieFrontLoading(
    entries: List<Triple<String, String?, Double>>,
    cutoffHour: Int = 14,
): FrontLoadingResult {
    data class DayAccum(
        var morning: Double = 0.0,
        var total: Double = 0.0,
    )

    val byDate = mutableMapOf<String, DayAccum>()
    for ((date, eatenAt, calories) in entries) {
        if (eatenAt == null) continue
        val hour = parseHour(eatenAt)
        val day = byDate.getOrPut(date) { DayAccum() }
        day.total += calories
        if (hour < cutoffHour) day.morning += calories
    }
    val days = byDate.values.toList()
    val sampleSize = days.size
    if (sampleSize == 0) {
        return FrontLoadingResult(
            avgMorningPct = 0.0,
            daysAbove50Pct = 0,
            totalDays = 0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val morningPcts = days.map { if (it.total > 0) (it.morning / it.total) * 100.0 else 0.0 }
    val avgMorningPct = morningPcts.sum() / sampleSize
    val daysAbove50Pct = morningPcts.count { it > 50.0 }
    return FrontLoadingResult(
        avgMorningPct = avgMorningPct,
        daysAbove50Pct = daysAbove50Pct,
        totalDays = sampleSize,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}

fun computeCalorieCycling(dailyNutrients: List<Pair<String, Double>>): CalorieCyclingResult {
    val sampleSize = dailyNutrients.size
    if (sampleSize == 0) {
        return CalorieCyclingResult(
            mean = 0.0,
            stddev = 0.0,
            cv = 0.0,
            pattern = "consistent",
            highDays = 0,
            lowDays = 0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val calories = dailyNutrients.map { it.second }
    val mean = calories.sum() / sampleSize
    val variance = calories.sumOf { (it - mean) * (it - mean) } / sampleSize
    val stddev = sqrt(variance)
    val cv = if (mean > 0) (stddev / mean) * 100.0 else 0.0
    val pattern =
        when {
            cv < 15.0 -> "consistent"
            cv < 30.0 -> "moderate"
            else -> "high_variance"
        }
    val highDays = calories.count { it > mean + stddev }
    val lowDays = calories.count { it < mean - stddev }
    return CalorieCyclingResult(
        mean = mean,
        stddev = stddev,
        cv = cv,
        pattern = pattern,
        highDays = highDays,
        lowDays = lowDays,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
