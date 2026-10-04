package com.bissbilanz.android.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.number
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
import java.time.chrono.IsoChronology
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale
import kotlin.time.Clock

/** Locale-aware month name (e.g. "January" / "Januar"), replacing the raw enum constant name. */
fun Month.displayName(style: TextStyle = TextStyle.FULL): String =
    java.time.Month
        .of(this.number)
        .getDisplayName(style, Locale.getDefault())

/** Locale-aware weekday name (e.g. "Mon" / "Mo."), replacing the raw enum constant name. */
fun DayOfWeek.displayName(style: TextStyle = TextStyle.SHORT): String =
    java.time.DayOfWeek
        .of(this.isoDayNumber)
        .getDisplayName(style, Locale.getDefault())

private val twoDigitYear = Regex("(?<!y)yy(?!y)")

/**
 * Numeric short date in the locale's own order and separators ("03.09.2026" in German,
 * "9/3/2026" in en-US). The platform's SHORT style abbreviates the year to two digits, so
 * it is widened to keep the date unambiguous. Never wraps in a button, unlike the long form.
 */
fun formatShortDate(
    date: LocalDate,
    locale: Locale = Locale.getDefault(),
): String {
    val pattern =
        DateTimeFormatterBuilder
            .getLocalizedDateTimePattern(FormatStyle.SHORT, null, IsoChronology.INSTANCE, locale)
            .replace(twoDigitYear, "yyyy")
    return DateTimeFormatter
        .ofPattern(pattern, locale)
        .format(java.time.LocalDate.of(date.year, date.month.number, date.day))
}

/**
 * [formatShortDate] for the "2026-10-03" strings the API and local database hand out. Anything
 * that is not an ISO date is shown unchanged rather than hidden.
 */
fun formatIsoDate(iso: String): String = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()?.let { formatShortDate(it) } ?: iso

/**
 * How a day is named in the UI: "Today" / "Yesterday" / "Tomorrow", otherwise the
 * localised numeric date. Shared so the dashboard's day stepper and the day log's
 * title agree — the day log used to render the raw ISO string.
 */
@Composable
fun dayLabel(date: LocalDate): String {
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    return when (date) {
        today -> stringResource(R.string.weight_widget_today)
        today.minus(1, DateTimeUnit.DAY) -> stringResource(R.string.dashboard_yesterday)
        today.plus(1, DateTimeUnit.DAY) -> stringResource(R.string.dashboard_tomorrow)
        else -> formatShortDate(date)
    }
}
