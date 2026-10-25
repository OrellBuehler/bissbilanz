package com.bissbilanz.android.util

import java.text.NumberFormat
import java.util.Locale

/**
 * A plain number in the UI locale with up to [maxDecimals] decimals and no grouping:
 * "7.4" in English, "7,4" in German, and "7" rather than "7.0" for a whole value.
 */
fun formatLocalizedNumber(
    value: Double,
    maxDecimals: Int,
    locale: Locale = Locale.getDefault(),
): String =
    NumberFormat
        .getNumberInstance(locale)
        .apply {
            minimumFractionDigits = 0
            maximumFractionDigits = maxDecimals
            isGroupingUsed = false
        }.format(value)
