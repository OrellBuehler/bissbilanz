package com.bissbilanz.analytics

import kotlinx.datetime.LocalDate

/**
 * Direction of a recent weight change, for the on-device trend indicator.
 * Lives in the shared module so the iOS and Android trend cards classify
 * identically instead of each re-deriving the thresholds.
 */
enum class WeightTrendDirection { RISING, FALLING, STEADY }

/**
 * Classifies a weight change (in kg) over a period into a trend direction.
 * Changes within [steadyBandKg] of zero are treated as daily-fluctuation noise
 * rather than a real trend.
 */
fun classifyWeightTrend(
    deltaKg: Double,
    steadyBandKg: Double = 0.3,
): WeightTrendDirection =
    when {
        deltaKg > steadyBandKg -> WeightTrendDirection.RISING
        deltaKg < -steadyBandKg -> WeightTrendDirection.FALLING
        else -> WeightTrendDirection.STEADY
    }

/** One dated weight measurement feeding the chart smoothing. */
data class WeightChartInput(
    val date: String,
    val weightKg: Double,
    val loggedAt: String? = null,
)

/** A collapsed per-day weight with its trailing calendar-day moving average. */
data class WeightChartPoint(
    val date: String,
    val weightKg: Double,
    val movingAvg: Double,
)

/**
 * The canonical weight-chart smoothing shared across server, web, Android and
 * iOS: same-date measurements collapse to the latest [WeightChartInput.loggedAt]
 * (later input order wins ties or missing timestamps), then each day gets the
 * average of the collapsed weights within the trailing [windowDays]-calendar-day
 * window ending on it. Days with sparse history average fewer points, so every
 * point has a value; a gap wider than the window resets the average rather than
 * smearing over it like a row-based window would. Mirrors the TS
 * `weightMovingAverage` and is locked by the golden parity vectors.
 */
fun weightMovingAverage(
    entries: List<WeightChartInput>,
    windowDays: Int = 7,
): List<WeightChartPoint> {
    require(windowDays >= 1) { "windowDays must be >= 1, was $windowDays" }
    val byDate = LinkedHashMap<String, WeightChartInput>()
    for (entry in entries) {
        runCatching { LocalDate.parse(entry.date) }.getOrNull() ?: continue
        val current = byDate[entry.date]
        if (current == null || (entry.loggedAt ?: "") >= (current.loggedAt ?: "")) {
            byDate[entry.date] = entry
        }
    }
    val daily = byDate.values.sortedBy { it.date }
    val epochDays = daily.map { LocalDate.parse(it.date).toEpochDays() }
    return daily.mapIndexed { i, entry ->
        val windowStart = epochDays[i] - (windowDays - 1)
        var sum = 0.0
        var count = 0
        var j = i
        while (j >= 0 && epochDays[j] >= windowStart) {
            sum += daily[j].weightKg
            count++
            j--
        }
        WeightChartPoint(date = entry.date, weightKg = entry.weightKg, movingAvg = sum / count)
    }
}

/** Slope and intercept of an ordinary least-squares line `y = slope * x + intercept`. */
data class LinearFit(
    val slope: Double,
    val intercept: Double,
)

/**
 * Ordinary least-squares fit of [ys] on [xs]. Returns null when the inputs are
 * mismatched in length, have fewer than two points, or have zero variance in x
 * (a vertical line has no defined slope).
 *
 * Callers pick their own x scale — entry index for evenly-spaced points, or day
 * offsets when real gaps between entries should matter — so the same fit backs
 * both the iOS and Android weight-projection charts.
 */
fun linearRegression(
    xs: List<Double>,
    ys: List<Double>,
): LinearFit? {
    val n = xs.size
    if (n < 2 || ys.size != n) return null
    val xMean = xs.sum() / n
    val yMean = ys.sum() / n
    var num = 0.0
    var den = 0.0
    for (i in 0 until n) {
        val dx = xs[i] - xMean
        num += dx * (ys[i] - yMean)
        den += dx * dx
    }
    if (den == 0.0) return null
    val slope = num / den
    return LinearFit(slope = slope, intercept = yMean - slope * xMean)
}
