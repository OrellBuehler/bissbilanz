package com.bissbilanz.analytics

import kotlinx.datetime.LocalDate
import kotlin.math.abs
import kotlin.math.exp
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
    /** Calendar days spanned by the weights the plateau test ran on. */
    val plateauDays: Int,
    val estimatedDeficit: Double?,
    /**
     * "intake_variance" or "none". Metabolic adaptation and sodium-driven water
     * retention are not identifiable from a scale plus a food log, so they are no
     * longer asserted.
     */
    val cause: String,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class WeightForecast(
    /** Trailing 7-day smoothed weight the projection is anchored on. */
    val currentWeight: Double?,
    val weeklyRate: Double,
    val day30: Double?,
    val day60: Double?,
    val day90: Double?,
    val sampleSize: Int,
    val confidence: ConfidenceLevel,
)

private class DatedPoint(
    val date: String,
    val day: Int,
    val value: Double,
)

private fun epochDay(date: String): Int = LocalDate.parse(date).toEpochDays()

/**
 * OLS slope of value on calendar day (kg/day). Regressing on the date rather
 * than the row index keeps sparse logging from compressing time.
 */
private fun slopePerDay(points: List<DatedPoint>): Double {
    val n = points.size
    val xMean = points.sumOf { it.day.toDouble() } / n
    val yMean = points.sumOf { it.value } / n
    var num = 0.0
    var den = 0.0
    for (p in points) {
        val dx = p.day - xMean
        num += dx * (p.value - yMean)
        den += dx * dx
    }
    return if (den == 0.0) 0.0 else num / den
}

/** One weight per measured date (same-date entries collapse to the latest); the slope is fitted to these. */
private fun measuredWeights(series: List<Pair<String, Double?>>): List<DatedPoint> =
    weightMovingAverage(series.mapNotNull { (date, kg) -> kg?.let { WeightChartInput(date, it) } }, 1)
        .map { DatedPoint(it.date, epochDay(it.date), it.weightKg) }

/** Trailing 7-calendar-day smoothed weights, one per measured date, for the projection anchor. */
private fun smoothedWeights(series: List<Pair<String, Double?>>): List<DatedPoint> =
    weightMovingAverage(series.mapNotNull { (date, kg) -> kg?.let { WeightChartInput(date, it) } }, 7)
        .map { DatedPoint(it.date, epochDay(it.date), it.movingAvg) }

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

private class WindowInputs(
    val weights: List<DatedPoint>,
    val calories: List<Double>,
)

private fun windowInputs(
    weightSeries: List<Pair<String, Double?>>,
    calorieSeries: List<Pair<String, Double?>>,
    windowDays: Int,
): WindowInputs {
    val allDates = weightSeries.map { it.first } + calorieSeries.map { it.first }
    val cutoff = cutoffFromData(allDates, windowDays)
    val weights = measuredWeights(weightSeries).filter { it.date >= cutoff }
    val calories = calorieSeries.filter { it.first >= cutoff && it.second != null }.map { it.second!! }
    return WindowInputs(weights, calories)
}

fun computeAdaptiveTDEE(
    weightSeries: List<Pair<String, Double?>>,
    calorieSeries: List<Pair<String, Double?>>,
    windowDays: Int = 14,
): TDEEResult {
    val (weights, calories) = windowInputs(weightSeries, calorieSeries, windowDays).let { Pair(it.weights, it.calories) }
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
    val weeklyRate = slopePerDay(weights) * 7
    val weeklyEnergyBalance = weeklyRate * KCAL_PER_KG_FAT
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
): PlateauResult {
    val inputs = windowInputs(weightSeries, calorieSeries, 14)
    val weights = inputs.weights
    val calories = inputs.calories
    val sampleSize = weights.size
    val confidence: ConfidenceLevel =
        when {
            sampleSize >= 14 -> ConfidenceLevel.MEDIUM
            sampleSize >= 7 -> ConfidenceLevel.LOW
            else -> ConfidenceLevel.INSUFFICIENT
        }

    fun notPlateaued(conf: ConfidenceLevel) =
        PlateauResult(
            isPlateaued = false,
            plateauDays = 0,
            estimatedDeficit = null,
            cause = "none",
            confidence = conf,
            sampleSize = sampleSize,
        )

    if (sampleSize < 3) return notPlateaued(ConfidenceLevel.INSUFFICIENT)
    val spanDays = weights.last().day - weights.first().day + 1
    // Fewer than seven weigh-ins over fewer than ten days cannot separate "flat"
    // from "not enough data": the slope's own standard error is of the order of
    // the plateau threshold there.
    if (sampleSize < 7 || spanDays < PLATEAU_MIN_SPAN_DAYS) return notPlateaued(confidence)
    val weeklyRate = slopePerDay(weights) * 7
    if (abs(weeklyRate) >= PLATEAU_THRESHOLD_KG_PER_WEEK) return notPlateaued(confidence)

    val estimatedDeficit = if (estimatedTDEE != null && calories.isNotEmpty()) estimatedTDEE - mean(calories) else null
    val cause = if (calories.isNotEmpty() && stddev(calories) > 300) "intake_variance" else "none"
    return PlateauResult(
        isPlateaued = true,
        plateauDays = spanDays,
        estimatedDeficit = estimatedDeficit,
        cause = cause,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}

/**
 * Projects the smoothed current weight forward at [weeklyRate], decelerating as
 * expenditure falls with mass (≈ 22 kcal/kg/day, Hall 2011): an exponential
 * approach with time constant τ = 7700 / 22 ≈ 350 days. [rateConfidence] is the
 * confidence of the rate estimate itself, which is what the projection rests on.
 */
fun projectWeight(
    weightSeries: List<Pair<String, Double?>>,
    weeklyRate: Double,
    rateConfidence: ConfidenceLevel? = null,
): WeightForecast {
    val smoothed = smoothedWeights(weightSeries)
    val currentWeight = smoothed.lastOrNull()?.value
    val sampleSize = smoothed.size
    val confidence: ConfidenceLevel =
        rateConfidence
            ?: when {
                sampleSize > 21 -> ConfidenceLevel.HIGH
                sampleSize > 14 -> ConfidenceLevel.MEDIUM
                sampleSize > 7 -> ConfidenceLevel.LOW
                else -> ConfidenceLevel.INSUFFICIENT
            }
    val tau = KCAL_PER_KG_FAT / EXPENDITURE_PER_KG_KCAL_PER_DAY
    val dailyRate = weeklyRate / 7

    fun project(days: Int): Double? = currentWeight?.let { it + dailyRate * tau * (1 - exp(-days / tau)) }
    return WeightForecast(
        currentWeight = currentWeight,
        weeklyRate = weeklyRate,
        day30 = project(30),
        day60 = project(60),
        day90 = project(90),
        sampleSize = sampleSize,
        confidence = confidence,
    )
}
