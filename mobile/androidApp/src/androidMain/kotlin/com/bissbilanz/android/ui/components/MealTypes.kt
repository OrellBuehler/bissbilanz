package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import com.bissbilanz.util.mealTypes as sharedMealTypes

val mealTypes = sharedMealTypes

/**
 * Localized label for a meal type. The four default meal types (from [mealTypes]) get a
 * translated label; custom, user-defined meal types are shown as-is (capitalized).
 */
@Composable
fun mealTypeDisplayName(mealType: String): String =
    when (mealType.lowercase()) {
        "breakfast" -> stringResource(R.string.meal_type_breakfast)
        "lunch" -> stringResource(R.string.meal_type_lunch)
        "dinner" -> stringResource(R.string.meal_type_dinner)
        "snack", "snacks" -> stringResource(R.string.meal_type_snack)
        else -> mealType.replaceFirstChar { it.uppercase() }
    }
