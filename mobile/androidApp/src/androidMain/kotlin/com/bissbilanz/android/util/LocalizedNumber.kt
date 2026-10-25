package com.bissbilanz.android.util

import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

/**
 * A plain number in the UI locale with up to [maxDecimals] decimals and no grouping:
 * "7.4" in English, "7,4" in German, and "7" rather than "7.0" for a whole value
 * unless [minDecimals] asks for fixed decimals. Rounds half up, like `String.format`.
 */
fun formatLocalizedNumber(
    value: Double,
    maxDecimals: Int,
    locale: Locale = Locale.getDefault(),
    minDecimals: Int = 0,
): String =
    NumberFormat
        .getNumberInstance(locale)
        .apply {
            minimumFractionDigits = minDecimals
            maximumFractionDigits = maxDecimals
            roundingMode = RoundingMode.HALF_UP
            isGroupingUsed = false
        }.format(value)
