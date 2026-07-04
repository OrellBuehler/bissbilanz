package com.bissbilanz.util

import kotlin.math.abs
import kotlin.math.roundToInt

fun Double.toDisplayString(): String = if (this == toLong().toDouble()) toLong().toString() else toString()

fun Double.formatNutrient(): String {
    val rounded = (this * 10).roundToInt() / 10.0
    return if (rounded == rounded.toLong().toDouble()) rounded.toLong().toString() else rounded.toString()
}

/** Rounds to the nearest whole number, e.g. for calorie or whole-percent displays like "245 kcal" or "12%". */
fun Double.formatAsInt(): String = roundToInt().toString()

/** [Float] overload of [formatAsInt], for values already carried as Float (e.g. Compose animation state). */
fun Float.formatAsInt(): String = roundToInt().toString()

/**
 * Fixed one-decimal-place format that always shows the decimal (e.g. "4.0", "4.5") — unlike
 * [formatNutrient], which trims a trailing ".0". A portable replacement for the JVM-only
 * `"%.1f".format(x)` idiom, safe to use from commonMain.
 */
fun Double.formatDecimal1(): String {
    val negative = this < 0
    val scaled = (abs(this) * 10).roundToInt()
    val whole = scaled / 10
    val frac = scaled % 10
    val sign = if (negative && (whole != 0 || frac != 0)) "-" else ""
    return "$sign$whole.$frac"
}

/** [Float] overload of [formatDecimal1], for values already carried as Float. */
fun Float.formatDecimal1(): String = toDouble().formatDecimal1()

/**
 * Parses user-typed numeric input, tolerating a comma decimal separator.
 *
 * Decimal keyboards on German-locale (and other) devices emit ',' rather than '.',
 * which the platform [toDoubleOrNull] rejects. Normalising the separator before
 * parsing keeps entries like "1,5" from silently becoming null.
 */
fun String.toLocalizedDoubleOrNull(): Double? = this.trim().replace(',', '.').toDoubleOrNull()
