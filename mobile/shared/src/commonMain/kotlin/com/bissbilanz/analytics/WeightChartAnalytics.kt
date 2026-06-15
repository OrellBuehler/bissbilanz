package com.bissbilanz.analytics

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

/**
 * Trailing moving average with partial leading windows: position `i` is the
 * average of the up-to-[window] values ending at `i`, so the first `window - 1`
 * positions average fewer points instead of being undefined. This keeps a value
 * at every point, which is what the weight chart's smoothing line draws.
 *
 * Note this differs from [movingAverage], which leaves the leading positions
 * null — that variant is for series where a partial window would be misleading.
 */
fun weightMovingAverage(
    values: List<Double>,
    window: Int,
): List<Double> {
    require(window >= 1) { "window must be >= 1, was $window" }
    return values.indices.map { i ->
        val start = maxOf(0, i - window + 1)
        val slice = values.subList(start, i + 1)
        slice.sum() / slice.size
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
