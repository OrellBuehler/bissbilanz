package com.bissbilanz.android.ui.components

/**
 * The entry for [date] or, failing that, the nearest one, preferring the latest entry
 * on or before it and falling back to the earliest one after. ISO dates sort as text.
 */
internal fun <T> List<T>.closestToDate(
    date: String,
    dateOf: (T) -> String,
): T? = filter { dateOf(it) <= date }.maxByOrNull(dateOf) ?: minByOrNull(dateOf)
