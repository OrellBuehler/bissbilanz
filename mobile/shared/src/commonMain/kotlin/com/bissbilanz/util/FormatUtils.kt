package com.bissbilanz.util

import kotlin.math.roundToInt

fun Double.toDisplayString(): String = if (this == toLong().toDouble()) toLong().toString() else toString()

fun Double.formatNutrient(): String {
    val rounded = (this * 10).roundToInt() / 10.0
    return if (rounded == rounded.toLong().toDouble()) rounded.toLong().toString() else rounded.toString()
}
