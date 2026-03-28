package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

enum class ConfidenceLevel { INSUFFICIENT, LOW, MEDIUM, HIGH }

data class CorrelationResult(
    val r: Double,
    val pValue: Double,
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
        return CorrelationResult(r = 0.0, pValue = 1.0, sampleSize = n, confidence = ConfidenceLevel.INSUFFICIENT, constantInput = true)
    }
    val r = sumXY / sqrt(sumX2 * sumY2)
    val clampedR = max(-1.0, min(1.0, r))
    val pValue: Double =
        if (n <= 2) {
            1.0
        } else {
            val r2 = clampedR * clampedR
            val t = clampedR * sqrt((n - 2).toDouble() / max(1 - r2, 1e-10))
            tDistPValue(t, n - 2)
        }
    return CorrelationResult(r = clampedR, pValue = pValue, sampleSize = n, confidence = confidence, constantInput = false)
}

private fun tDistPValue(
    t: Double,
    df: Int,
): Double {
    val x = df.toDouble() / (df + t * t)
    val p = incompleteBeta(df / 2.0, 0.5, x)
    return min(1.0, max(0.0, p))
}

private fun incompleteBeta(
    a: Double,
    b: Double,
    x: Double,
): Double {
    if (x < 0 || x > 1) return 0.0
    if (x == 0.0) return 0.0
    if (x == 1.0) return 1.0
    val lbeta = lgamma(a) + lgamma(b) - lgamma(a + b)
    val bt = exp(a * ln(x) + b * ln(1 - x) - lbeta)
    return if (x < (a + 1) / (a + b + 2)) {
        (bt * betaCF(a, b, x)) / a
    } else {
        1 - (bt * betaCF(b, a, 1 - x)) / b
    }
}

private fun betaCF(
    a: Double,
    b: Double,
    x: Double,
): Double {
    val maxIter = 200
    val eps = 3e-7
    val qab = a + b
    val qap = a + 1
    val qam = a - 1
    var c = 1.0
    var d = 1.0 - (qab * x) / qap
    if (abs(d) < 1e-30) d = 1e-30
    d = 1.0 / d
    var h = d
    for (m in 1..maxIter) {
        val m2 = 2 * m
        var aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if (abs(d) < 1e-30) d = 1e-30
        c = 1.0 + aa / c
        if (abs(c) < 1e-30) c = 1e-30
        d = 1.0 / d
        h *= d * c
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if (abs(d) < 1e-30) d = 1e-30
        c = 1.0 + aa / c
        if (abs(c) < 1e-30) c = 1e-30
        d = 1.0 / d
        val del = d * c
        h *= del
        if (abs(del - 1.0) < eps) break
    }
    return h
}

private fun lgamma(z: Double): Double {
    val g = 7
    val c =
        doubleArrayOf(
            0.99999999999980993,
            676.5203681218851,
            -1259.1392167224028,
            771.32342877765313,
            -176.61502916214059,
            12.507343278686905,
            -0.13857109526572012,
            9.9843695780195716e-6,
            1.5056327351493116e-7,
        )
    if (z < 0.5) {
        return ln(Math.PI / sin(Math.PI * z)) - lgamma(1 - z)
    }
    var zz = z - 1
    var x = c[0]
    for (i in 1 until g + 2) {
        x += c[i] / (zz + i)
    }
    val t = zz + g + 0.5
    return 0.5 * ln(2 * Math.PI) + (zz + 0.5) * ln(t) - t + ln(x)
}
