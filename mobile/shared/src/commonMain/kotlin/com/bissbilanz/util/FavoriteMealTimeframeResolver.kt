package com.bissbilanz.util

import com.bissbilanz.api.generated.model.FavoriteMealTimeframe

/**
 * Returns the meal type whose [FavoriteMealTimeframe] window contains [minuteOfDay].
 * Window semantics: start inclusive, end exclusive. Lower [FavoriteMealTimeframe.sortOrder]
 * wins when windows overlap (matches PWA behaviour).
 */
fun resolveMealTypeForMinuteOfDay(
    minuteOfDay: Int,
    timeframes: List<FavoriteMealTimeframe>,
): String? =
    timeframes
        .asSequence()
        .filter { minuteOfDay in it.startMinute until it.endMinute }
        .minByOrNull { it.sortOrder }
        ?.mealType
