package com.bissbilanz.analytics

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/*
 * Small, dependency-free inference helpers shared by the insight analytics.
 * Line-for-line twin of `src/lib/analytics/stats.ts`; the golden-vector parity
 * suite holds the two together, so keep the arithmetic identical (same
 * approximations, same operation order) when changing either side.
 */

private val SQRT2 = sqrt(2.0)

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
 * (|error| < 1.5e-7). Used for the DII percentile transform.
 */
fun normalCdf(z: Double): Double {
    val t = 1.0 / (1.0 + 0.3275911 * abs(z) / SQRT2)
    val poly =
        t *
            (
                0.254829592 +
                    t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))
            )
    val erf = 1.0 - poly * exp(-(z * z) / 2.0)
    return 0.5 * (1.0 + (if (z < 0) -erf else erf))
}

/** Two-sided p-value of a Student t statistic with [df] degrees of freedom. */
fun studentTwoSidedP(
    t: Double,
    df: Double,
): Double {
    if (df <= 0 || t.isNaN() || t.isInfinite()) return 1.0
    val x = df / (df + t * t)
    val p = incompleteBeta(df / 2.0, 0.5, x)
    return min(1.0, max(0.0, p))
}

data class WelchResult(
    val t: Double,
    val df: Double,
    val pValue: Double,
)

/**
 * Welch's unequal-variance t-test between two samples. Returns `pValue = 1`
 * when either sample has fewer than two points or both have zero variance.
 */
fun welchTTest(
    a: List<Double>,
    b: List<Double>,
): WelchResult {
    val na = a.size
    val nb = b.size
    if (na < 2 || nb < 2) return WelchResult(0.0, 0.0, 1.0)
    val ma = mean(a)
    val mb = mean(b)
    val va = sampleVariance(a, ma)
    val vb = sampleVariance(b, mb)
    val se2 = va / na + vb / nb
    if (se2 == 0.0) return WelchResult(0.0, (na + nb - 2).toDouble(), 1.0)
    val t = (ma - mb) / sqrt(se2)
    val df = (se2 * se2) / ((va * va) / (na.toDouble() * na * (na - 1)) + (vb * vb) / (nb.toDouble() * nb * (nb - 1)))
    return WelchResult(t, df, studentTwoSidedP(t, df))
}

/**
 * Benjamini–Hochberg adjusted p-values (q-values), in the input order. Controls
 * the false-discovery rate across a family of screening tests.
 */
fun benjaminiHochberg(pValues: List<Double>): List<Double> {
    val m = pValues.size
    if (m == 0) return emptyList()
    val order = pValues.withIndex().sortedBy { it.value }
    val q = DoubleArray(m)
    var running = 1.0
    for (k in m - 1 downTo 0) {
        val adjusted = min(1.0, (order[k].value * m) / (k + 1))
        running = min(running, adjusted)
        q[order[k].index] = running
    }
    return q.toList()
}

/**
 * 95% confidence interval for a Pearson r via the Fisher z-transform. Returns
 * the full [-1, 1] interval when n < 4 (the transform is undefined there).
 */
fun fisherCI95(
    r: Double,
    n: Int,
): Pair<Double, Double> {
    if (n < 4) return Pair(-1.0, 1.0)
    val clamped = max(-0.999999, min(0.999999, r))
    val z = 0.5 * ln((1 + clamped) / (1 - clamped))
    val se = 1.0 / sqrt((n - 3).toDouble())
    val lo = z - 1.959964 * se
    val hi = z + 1.959964 * se
    return Pair(tanh(lo), tanh(hi))
}

internal fun mean(values: List<Double>): Double = values.sum() / values.size

private fun sampleVariance(
    values: List<Double>,
    m: Double,
): Double {
    if (values.size < 2) return 0.0
    return values.sumOf { (it - m) * (it - m) } / (values.size - 1)
}

// --- incomplete beta (Numerical Recipes: modified Lentz continued fraction) ---

internal fun incompleteBeta(
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
        return ln(PI / sin(PI * z)) - lgamma(1 - z)
    }
    val zz = z - 1
    var x = c[0]
    for (i in 1 until g + 2) {
        x += c[i] / (zz + i)
    }
    val t = zz + g + 0.5
    return 0.5 * ln(2 * PI) + (zz + 0.5) * ln(t) - t + ln(x)
}
