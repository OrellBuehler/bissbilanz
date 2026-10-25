package com.bissbilanz.android.util

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Instant

data class SleepTimes(
    val bedtime: Instant,
    val wakeTime: Instant,
) {
    val durationMinutes: Int get() = (wakeTime - bedtime).inWholeMinutes.toInt()
}

/**
 * The bed and wake instants of a night that ends on [entryDate]. Waking happens on the
 * entry date; going to bed happens the evening before only when the bedtime is later in
 * the day than the wake time — a 00:30 bedtime is already on the entry date.
 *
 * When [original] is given and neither the date nor either time of day was changed, it
 * is returned as-is, so editing only the notes never moves a Health Connect night.
 */
fun resolveSleepTimes(
    entryDate: LocalDate,
    bedtime: LocalTime,
    wakeTime: LocalTime,
    zone: TimeZone,
    original: SleepTimes? = null,
    originalEntryDate: LocalDate? = null,
): SleepTimes {
    if (original != null &&
        originalEntryDate == entryDate &&
        original.bedtime.toLocalDateTime(zone).time == bedtime &&
        original.wakeTime.toLocalDateTime(zone).time == wakeTime
    ) {
        return original
    }
    val bedDate = if (bedtime > wakeTime) entryDate.minus(1, DateTimeUnit.DAY) else entryDate
    return SleepTimes(
        bedtime = LocalDateTime(bedDate, bedtime).toInstant(zone),
        wakeTime = LocalDateTime(entryDate, wakeTime).toInstant(zone),
    )
}
