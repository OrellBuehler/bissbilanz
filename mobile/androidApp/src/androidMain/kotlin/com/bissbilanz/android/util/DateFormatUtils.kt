package com.bissbilanz.android.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
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

/**
 * How a day is named in the UI: "Today" / "Yesterday" / "Tomorrow", otherwise the
 * localised long date. Shared so the dashboard's day stepper and the day log's
 * title agree — the day log used to render the raw ISO string.
 */
@Composable
fun dayLabel(date: LocalDate): String {
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    return when (date) {
        today -> stringResource(R.string.weight_widget_today)
        today.minus(1, DateTimeUnit.DAY) -> stringResource(R.string.dashboard_yesterday)
        today.plus(1, DateTimeUnit.DAY) -> stringResource(R.string.dashboard_tomorrow)
        else -> "${date.dayOfMonth} ${date.month.displayName()} ${date.year}"
    }
}
