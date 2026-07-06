package com.bissbilanz.android.util

import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Month
import kotlinx.datetime.isoDayNumber
import java.time.format.TextStyle
import java.util.Locale

/** Locale-aware month name (e.g. "January" / "Januar"), replacing the raw enum constant name. */
fun Month.displayName(style: TextStyle = TextStyle.FULL): String =
    java.time.Month
        .of(this.value)
        .getDisplayName(style, Locale.getDefault())

/** Locale-aware weekday name (e.g. "Mon" / "Mo."), replacing the raw enum constant name. */
fun DayOfWeek.displayName(style: TextStyle = TextStyle.SHORT): String =
    java.time.DayOfWeek
        .of(this.isoDayNumber)
        .getDisplayName(style, Locale.getDefault())
