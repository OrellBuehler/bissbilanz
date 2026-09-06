package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import com.bissbilanz.model.ScheduleType

/** Localized label for a supplement's time-of-day schedule option. */
@Composable
fun timeOfDayDisplayName(value: String): String =
    when (value) {
        "morning" -> stringResource(R.string.supplement_time_morning)
        "noon" -> stringResource(R.string.supplement_time_noon)
        "evening" -> stringResource(R.string.supplement_time_evening)
        "anytime" -> stringResource(R.string.supplement_time_anytime)
        else -> value.replaceFirstChar { it.uppercase() }
    }

/** Localized label for a supplement dosage unit. Units like "mg" or "IU" are the same in both languages. */
@Composable
fun dosageUnitDisplayName(unit: String): String =
    when (unit) {
        "drops" -> stringResource(R.string.supplement_unit_drops)
        "capsules" -> stringResource(R.string.supplement_unit_capsules)
        "tablets" -> stringResource(R.string.supplement_unit_tablets)
        else -> unit
    }

/**
 * Day-of-week labels indexed by the server's `scheduleDays` encoding: 0 = Sunday
 * through 6 = Saturday, matching `formatSchedule` on the web and the `isoDayNumber % 7`
 * rotation in [com.bissbilanz.util.SupplementSchedule].
 */
@Composable
fun weekdayLabels(): List<String> =
    listOf(
        stringResource(R.string.supplement_day_sun),
        stringResource(R.string.supplement_day_mon),
        stringResource(R.string.supplement_day_tue),
        stringResource(R.string.supplement_day_wed),
        stringResource(R.string.supplement_day_thu),
        stringResource(R.string.supplement_day_fri),
        stringResource(R.string.supplement_day_sat),
    )

/**
 * Localized one-line summary of a supplement's schedule. Weekly and specific-days
 * schedules list their days; both are only ever due on the days they name, so an
 * empty list reads as "no days set" rather than silently looking like "daily".
 */
@Composable
fun scheduleDisplayName(
    scheduleType: ScheduleType,
    scheduleDays: List<Int>?,
): String =
    when (scheduleType) {
        ScheduleType.daily -> stringResource(R.string.supplement_edit_daily)
        ScheduleType.every_other_day -> stringResource(R.string.supplement_schedule_every_other_day)
        ScheduleType.weekly, ScheduleType.specific_days -> {
            val labels = weekdayLabels()
            val days = scheduleDays.orEmpty().filter { it in labels.indices }.sorted()
            if (days.isEmpty()) {
                stringResource(R.string.supplement_schedule_no_days)
            } else {
                days.joinToString(", ") { labels[it] }
            }
        }
    }
