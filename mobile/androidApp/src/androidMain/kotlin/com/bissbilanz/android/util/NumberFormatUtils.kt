package com.bissbilanz.android.util

import java.text.NumberFormat
import java.util.Locale

/** Up to [maxDecimals] decimals in the UI locale, none when whole: "2.5" in English, "2,5" in German, "2". */
fun formatDecimal(
    value: Double,
    maxDecimals: Int = 2,
    locale: Locale = Locale.getDefault(),
): String =
    NumberFormat
        .getNumberInstance(locale)
        .apply { maximumFractionDigits = maxDecimals }
        .format(value)
