package com.bissbilanz.android.ui.components

import com.bissbilanz.model.Food

internal const val FOOD_PICKER_MIN_QUERY = 2

internal fun isSearchQuery(query: String): Boolean = query.trim().length >= FOOD_PICKER_MIN_QUERY

internal fun List<Food>.pickable(
    excludeIds: Set<String>,
    accept: (Food) -> Boolean,
): List<Food> = filter { it.id !in excludeIds && accept(it) }

internal fun List<Food>.matchingQuery(query: String): List<Food> {
    if (!isSearchQuery(query)) return this
    val needle = query.trim()
    return filter { it.name.contains(needle, ignoreCase = true) || it.brand?.contains(needle, ignoreCase = true) == true }
}
