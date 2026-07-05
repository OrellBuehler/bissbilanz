package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R

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
