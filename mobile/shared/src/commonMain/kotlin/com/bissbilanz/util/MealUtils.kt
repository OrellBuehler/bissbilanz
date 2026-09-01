package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Preferences
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock

/**
 * The four default meal types in their canonical, server-side spelling. The server
 * normalizes every incoming meal type to these (src/lib/utils/meals.ts), so a list
 * spelled any other way makes locally created entries and the ones that come back
 * from a refresh land in two different groups.
 */
val mealTypes = listOf("Breakfast", "Lunch", "Dinner", "Snacks")

private val mealTypeAliases =
    mapOf(
        "breakfast" to "Breakfast",
        "lunch" to "Lunch",
        "dinner" to "Dinner",
        "snack" to "Snacks",
        "snacks" to "Snacks",
    )

/**
 * Canonical spelling for a default meal type, mirroring the server's
 * `normalizeMealType`. Custom meal types are matched verbatim server-side and are
 * returned unchanged. Group entries by this rather than by the raw string: the
 * server stores "Snacks" for what older builds sent as "snack", and grouping the
 * two apart shows one meal as two sections.
 */
fun normalizeMealType(value: String): String = mealTypeAliases[value.lowercase()] ?: value

fun resolveDefaultMeal(preferences: Preferences?): String? {
    if (preferences == null) return null
    if (preferences.favoriteMealAssignmentMode == "ask_meal") return null

    val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
    val minuteOfDay = now.hour * 60 + now.minute

    for (timeframe in preferences.favoriteMealTimeframes) {
        if (minuteOfDay >= timeframe.startMinute && minuteOfDay < timeframe.endMinute) {
            return timeframe.mealType
        }
    }
    return null
}
