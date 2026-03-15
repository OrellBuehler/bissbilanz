package com.bissbilanz.util

import com.bissbilanz.model.Preferences
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

val mealTypes = listOf("breakfast", "lunch", "dinner", "snack")

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
