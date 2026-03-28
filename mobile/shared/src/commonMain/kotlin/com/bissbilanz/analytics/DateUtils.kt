package com.bissbilanz.analytics

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus

internal fun shiftDate(
    isoDate: String,
    days: Int,
): String {
    val date = LocalDate.parse(isoDate)
    return date.plus(days, DateTimeUnit.DAY).toString()
}
