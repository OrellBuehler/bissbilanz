package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class TDEEResult(
    val estimatedTDEE: Double?,
    val trend: String,
    val avgIntake: Double,
    val weeklyRate: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class PlateauResult(
    val isPlateaued: Boolean,
    val plateauDays: Int,
    val estimatedDeficit: Double?,
    val cause: String,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class WeightForecast(
    val currentWeight: Double?,
    val weeklyRate: Double,
    val day30: Double?,
    val day60: Double?,
    val day90: Double?,
    val sampleSize: Int,
    val confidence: ConfidenceLevel,
)

private fun linearSlope(values: List<Double>): Double {
    val n = values.size
    val xMean = (n - 1) / 2.0
    val yMean = values.sum() / n
    var num = 0.0
    var den = 0.0
    for (i in 0 until n) {
        val dx = i - xMean
        num += dx * (values[i] - yMean)
        den += dx * dx
    }
    return if (den == 0.0) 0.0 else num / den
}

private fun mean(values: List<Double>): Double = values.sum() / values.size

private fun stddev(values: List<Double>): Double {
    val m = mean(values)
    return sqrt(values.sumOf { (it - m) * (it - m) } / values.size)
}

private fun cutoffFromData(
    dates: List<String>,
    windowDays: Int,
): String {
    if (dates.isEmpty()) return ""
    val maxDate = dates.max()
    return shiftDate(maxDate, -windowDays)
}

fun computeAdaptiveTDEE(
    weightSeries: List<Pair<String, Double?>>,
    calorieSeries: List<Pair<String, Double?>>,
    windowDays: Int = 14,
): TDEEResult {
    val allDates = weightSeries.map { it.first } + calorieSeries.map { it.first }
    val cutoff = cutoffFromData(allDates, windowDays)
    val weights =
        weightSeries
            .filter { it.first >= cutoff && it.second != null }
            .sortedBy { it.first }
            .map { it.second!! }
    val calories =
        calorieSeries
            .filter { it.first >= cutoff && it.second != null }
            .map { it.second!! }
    val sampleSize = weights.size
    if (weights.size < 5 || calories.size < 10) {
        return TDEEResult(
            estimatedTDEE = null,
            trend = "maintenance",
            avgIntake = if (calories.isNotEmpty()) mean(calories) else 0.0,
            weeklyRate = 0.0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = sampleSize,
        )
    }
    val slope = linearSlope(weights)
    val weeklyRate = slope * 7
    val weeklyEnergyBalance = weeklyRate * 7700
    val avgDailyIntake = mean(calories)
    var estimatedTDEE = avgDailyIntake - weeklyEnergyBalance / 7
    var confidence: ConfidenceLevel =
        when {
            sampleSize >= 21 -> ConfidenceLevel.HIGH
            sampleSize >= 14 -> ConfidenceLevel.MEDIUM
            else -> ConfidenceLevel.LOW
        }
    if (estimatedTDEE < 1200 || estimatedTDEE > 5000) {
        estimatedTDEE = max(1200.0, min(5000.0, estimatedTDEE))
        confidence = ConfidenceLevel.LOW
    }
    val trend =
        when {
            weeklyRate < -0.05 -> "loss"
            weeklyRate > 0.05 -> "gain"
            else -> "maintenance"
        }
    return TDEEResult(
        estimatedTDEE = estimatedTDEE,
        trend = trend,
        avgIntake = avgDailyIntake,
        weeklyRate = weeklyRate,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}

fun detectPlateau(
    weightSeries: List<Pair<String, Double?>>,
    calorieSeries: List<Pair<String, Double?>>,
    estimatedTDEE: Double?,
    sodiumAvg: Double? = null,
): PlateauResult {
    val allDates = weightSeries.map { it.first } + calorieSeries.map { it.first }
    val cutoff = cutoffFromData(allDates, 14)
    val weights =
        weightSeries
            .filter { it.first >= cutoff && it.second != null }
            .sortedBy { it.first }
            .map { it.second!! }
    val calories =
        calorieSeries
            .filter { it.first >= cutoff && it.second != null }
            .map { it.second!! }
    val sampleSize = weights.size
    val confidence: ConfidenceLevel =
        when {
            sampleSize >= 14 -> ConfidenceLevel.MEDIUM
            sampleSize >= 7 -> ConfidenceLevel.LOW
            else -> ConfidenceLevel.INSUFFICIENT
        }
    if (sampleSize < 3) {
        return PlateauResult(
            isPlateaued = false,
            plateauDays = 0,
            estimatedDeficit = null,
            cause = "none",
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = sampleSize,
        )
    }
    val slope = linearSlope(weights)
    val weeklyRate = slope * 7
    val isPlateaued = abs(weeklyRate) < 0.1
    if (!isPlateaued) {
        return PlateauResult(
            isPlateaued = false,
            plateauDays = 0,
            estimatedDeficit = null,
            cause = "none",
            confidence = confidence,
            sampleSize = sampleSize,
        )
    }
    val estimatedDeficit = if (estimatedTDEE != null && calories.isNotEmpty()) estimatedTDEE - mean(calories) else null
    val cause =
        when {
            calories.isNotEmpty() && stddev(calories) > 300 -> "intake_variance"
            sodiumAvg != null && sodiumAvg > 3000 -> "water_retention"
            estimatedDeficit != null && estimatedDeficit > 200 -> "adaptive_metabolism"
            else -> "none"
        }
    return PlateauResult(
        isPlateaued = true,
        plateauDays = sampleSize,
        estimatedDeficit = estimatedDeficit,
        cause = cause,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}

fun projectWeight(
    weightSeries: List<Pair<String, Double?>>,
    weeklyRate: Double,
): WeightForecast {
    val sorted =
        weightSeries
            .filter { it.second != null }
            .sortedBy { it.first }
    val currentWeight = if (sorted.isNotEmpty()) sorted.last().second else null
    val sampleSize = sorted.size
    val confidence: ConfidenceLevel =
        when {
            sampleSize > 21 -> ConfidenceLevel.HIGH
            sampleSize > 14 -> ConfidenceLevel.MEDIUM
            sampleSize > 7 -> ConfidenceLevel.LOW
            else -> ConfidenceLevel.INSUFFICIENT
        }
    val day30 = currentWeight?.let { it + (weeklyRate * 30) / 7 }
    val day60 = currentWeight?.let { it + (weeklyRate * 60) / 7 }
    val day90 = currentWeight?.let { it + (weeklyRate * 90) / 7 }
    return WeightForecast(
        currentWeight = currentWeight,
        weeklyRate = weeklyRate,
        day30 = day30,
        day60 = day60,
        day90 = day90,
        sampleSize = sampleSize,
        confidence = confidence,
    )
}
