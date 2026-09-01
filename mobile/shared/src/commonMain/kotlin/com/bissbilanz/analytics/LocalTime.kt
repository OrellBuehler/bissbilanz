package com.bissbilanz.analytics

import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

private const val MINUTES_PER_DAY = 1440

/**
 * Hour (local) at which one eating day ends and the next begins. A snack at
 * 00:30 belongs to the evening before it, not to the morning after — so every
 * "day" the timing analytics reason about runs from 04:00 to 03:59.
 */
const val EATING_DAY_BOUNDARY_MINUTES: Int = 4 * 60

/**
 * Minutes since local midnight (0..1439) for the UTC instant [isoString], rendered
 * in the IANA [timeZone]. Returns null if the timestamp can't be parsed.
 *
 * Deterministic: the result depends only on the explicit [timeZone], never on the
 * host's runtime timezone — production callers pass the device timezone while tests
 * pass a fixed zone. Format-agnostic: handles both "...Z" and offset-bearing strings
 * since it operates on the absolute instant. Mirrors the web `localMinutesOfDay` so
 * both platforms bucket hours identically.
 */
fun localMinutesOfDay(
    isoString: String,
    timeZone: String,
): Int? {
    val instant = parseInstant(isoString) ?: return null
    val tz = parseZone(timeZone) ?: return null
    val local = instant.toLocalDateTime(tz)
    return local.hour * 60 + local.minute
}

/** An instant placed on its eating day; mirrors the web `EatingDayPoint`. */
data class EatingDayPoint(
    /** The eating day (local calendar date of `instant - boundary`). */
    val date: String,
    /** Minutes since the eating-day boundary (0..1439). */
    val minutes: Int,
    /** Minutes since local midnight on the real clock (0..1439). */
    val clockMinutes: Int,
)

/**
 * Assigns an instant to an eating day that starts at [EATING_DAY_BOUNDARY_MINUTES]
 * local time. [EatingDayPoint.minutes] counts from that boundary, so first/last-meal
 * arithmetic within a day never wraps at midnight. Mirrors the web `eatingDayOf`.
 */
fun eatingDayOf(
    isoString: String,
    timeZone: String,
    boundaryMinutes: Int = EATING_DAY_BOUNDARY_MINUTES,
): EatingDayPoint? {
    val instant = parseInstant(isoString) ?: return null
    val tz = parseZone(timeZone) ?: return null
    val shifted = instant.minus(boundaryMinutes.minutes).toLocalDateTime(tz)
    val real = instant.toLocalDateTime(tz)
    return EatingDayPoint(
        date = shifted.date.toString(),
        minutes = shifted.hour * 60 + shifted.minute,
        clockMinutes = real.hour * 60 + real.minute,
    )
}

/**
 * Mean of clock times (minutes since midnight) treated as angles on the 24-hour
 * circle, so 23:00 and 01:00 average to 00:00 rather than noon. Returns a value
 * in [0, 1440); null for an empty input or a perfectly dispersed one.
 */
fun circularMeanMinutes(values: List<Double>): Double? {
    val n = values.size
    if (n == 0) return null
    var sumSin = 0.0
    var sumCos = 0.0
    for (v in values) {
        val angle = (2 * PI * v) / MINUTES_PER_DAY
        sumSin += sin(angle)
        sumCos += cos(angle)
    }
    val resultant = sqrt(sumSin * sumSin + sumCos * sumCos) / n
    if (resultant < 1e-12) return null
    var angle = atan2(sumSin, sumCos)
    if (angle < 0) angle += 2 * PI
    val minutes = (angle * MINUTES_PER_DAY) / (2 * PI)
    return if (minutes >= MINUTES_PER_DAY) minutes - MINUTES_PER_DAY else minutes
}

/**
 * Circular standard deviation of clock times in minutes
 * (`sqrt(-2 ln R)`, Fisher 1993), which agrees with the linear SD for tightly
 * clustered times and stays finite when the times straddle midnight.
 */
fun circularStdMinutes(values: List<Double>): Double {
    val n = values.size
    if (n <= 1) return 0.0
    var sumSin = 0.0
    var sumCos = 0.0
    for (v in values) {
        val angle = (2 * PI * v) / MINUTES_PER_DAY
        sumSin += sin(angle)
        sumCos += cos(angle)
    }
    val resultant = sqrt(sumSin * sumSin + sumCos * sumCos) / n
    if (resultant >= 1 - 1e-12) return 0.0
    if (resultant <= 1e-12) return MINUTES_PER_DAY / 2.0
    val radians = sqrt(-2 * ln(resultant))
    return min(MINUTES_PER_DAY / 2.0, (radians * MINUTES_PER_DAY) / (2 * PI))
}

private fun parseInstant(isoString: String): Instant? =
    try {
        Instant.parse(isoString)
    } catch (e: IllegalArgumentException) {
        null
    }

private fun parseZone(timeZone: String): TimeZone? =
    try {
        TimeZone.of(timeZone)
    } catch (e: IllegalArgumentException) {
        null
    }
