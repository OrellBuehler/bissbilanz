package com.bissbilanz.analytics

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

enum class ConfidenceLevel { INSUFFICIENT, LOW, MEDIUM, HIGH }

data class CorrelationResult(
    val r: Double,
    val pValue: Double,
    /** 95% Fisher-z confidence interval on r; [-1, 1] when n < 4. */
    val ciLow: Double,
    val ciHigh: Double,
    val sampleSize: Int,
    val confidence: ConfidenceLevel,
    val constantInput: Boolean,
)

fun getConfidenceLevel(sampleSize: Int): ConfidenceLevel =
    when {
        sampleSize < 7 -> ConfidenceLevel.INSUFFICIENT
        sampleSize < 14 -> ConfidenceLevel.LOW
        sampleSize < 30 -> ConfidenceLevel.MEDIUM
        else -> ConfidenceLevel.HIGH
    }

fun pearsonCorrelation(
    x: DoubleArray,
    y: DoubleArray,
): CorrelationResult {
    require(x.size == y.size) { "Array lengths must match: got ${x.size} and ${y.size}" }
    val n = x.size
    val confidence = getConfidenceLevel(n)
    val xMean = x.sum() / n
    val yMean = y.sum() / n
    var sumXY = 0.0
    var sumX2 = 0.0
    var sumY2 = 0.0
    for (i in 0 until n) {
        val dx = x[i] - xMean
        val dy = y[i] - yMean
        sumXY += dx * dy
        sumX2 += dx * dx
        sumY2 += dy * dy
    }
    if (sumX2 == 0.0 || sumY2 == 0.0) {
        return CorrelationResult(
            r = 0.0,
            pValue = 1.0,
            ciLow = 0.0,
            ciHigh = 0.0,
            sampleSize = n,
            confidence = ConfidenceLevel.INSUFFICIENT,
            constantInput = true,
        )
    }
    val r = sumXY / sqrt(sumX2 * sumY2)
    val clampedR = max(-1.0, min(1.0, r))
    val pValue: Double =
        if (n <= 2) {
            1.0
        } else {
            val r2 = clampedR * clampedR
            val t = clampedR * sqrt((n - 2).toDouble() / max(1 - r2, 1e-10))
            studentTwoSidedP(t, (n - 2).toDouble())
        }
    val (ciLow, ciHigh) = fisherCI95(clampedR, n)
    return CorrelationResult(
        r = clampedR,
        pValue = pValue,
        ciLow = ciLow,
        ciHigh = ciHigh,
        sampleSize = n,
        confidence = confidence,
        constantInput = false,
    )
}
