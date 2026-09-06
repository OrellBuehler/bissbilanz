package com.bissbilanz.wear

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalContext

/**
 * The four default meal types travel as their canonical English keys, because
 * that is what the server stores. Showing the raw key would leave "Breakfast" on
 * a German watch, so translate the four we know and leave a custom type as the
 * user typed it — only tidied to title case, like the Apple Watch app does.
 */
fun mealDisplayName(
    resources: Resources,
    key: String,
): String =
    when (key.lowercase()) {
        "breakfast" -> resources.getString(R.string.meal_breakfast)
        "lunch" -> resources.getString(R.string.meal_lunch)
        "dinner" -> resources.getString(R.string.meal_dinner)
        "snacks", "snack" -> resources.getString(R.string.meal_snacks)
        else -> titleCaseMeal(key)
    }

@Composable
@ReadOnlyComposable
fun mealName(key: String): String = mealDisplayName(LocalContext.current.resources, key)

internal fun titleCaseMeal(key: String): String =
    key
        .split(" ")
        .joinToString(" ") { word -> word.replaceFirstChar { it.uppercaseChar() } }

/**
 * The meal a log started now most likely belongs to, matching the Apple Watch
 * app's `defaultMealForNow()` and the phone's favourite quick-log heuristic.
 */
internal fun defaultMealForHour(hour: Int): String =
    when (hour) {
        in 5..10 -> "Breakfast"
        in 11..13 -> "Lunch"
        in 14..16 -> "Snacks"
        else -> "Dinner"
    }

/**
 * [defaultMealForHour] resolved against the meal types the phone actually offers
 * — a user who renamed or removed a default must not get a meal that isn't there.
 */
internal fun defaultMeal(
    mealTypes: List<String>,
    hour: Int,
): String {
    val preferred = defaultMealForHour(hour)
    return mealTypes.firstOrNull { it.equals(preferred, ignoreCase = true) } ?: mealTypes.firstOrNull() ?: preferred
}
