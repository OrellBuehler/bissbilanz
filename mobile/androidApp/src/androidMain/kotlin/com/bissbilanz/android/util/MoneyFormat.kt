package com.bissbilanz.android.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** USD with exactly two decimals in the UI locale: "$4.20" in English, "4,20 $" in German. */
fun formatUsd(
    amount: Double,
    locale: Locale = Locale.getDefault(),
): String =
    NumberFormat
        .getCurrencyInstance(locale)
        .apply {
            currency = Currency.getInstance("USD")
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }.format(amount)
