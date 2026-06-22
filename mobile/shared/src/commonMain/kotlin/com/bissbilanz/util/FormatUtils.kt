package com.bissbilanz.util

import kotlin.math.roundToInt

fun Double.toDisplayString(): String = if (this == toLong().toDouble()) toLong().toString() else toString()

fun Double.formatNutrient(): String {
    val rounded = (this * 10).roundToInt() / 10.0
    return if (rounded == rounded.toLong().toDouble()) rounded.toLong().toString() else rounded.toString()
}

/**
 * Parses user-typed numeric input, tolerating a comma decimal separator.
 *
 * Decimal keyboards on German-locale (and other) devices emit ',' rather than '.',
 * which the platform [toDoubleOrNull] rejects. Normalising the separator before
 * parsing keeps entries like "1,5" from silently becoming null.
 */
fun String.toLocalizedDoubleOrNull(): Double? = this.trim().replace(',', '.').toDoubleOrNull()
