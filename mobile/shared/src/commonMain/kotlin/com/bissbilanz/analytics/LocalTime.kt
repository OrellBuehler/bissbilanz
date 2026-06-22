package com.bissbilanz.analytics

import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

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
    val instant =
        try {
            Instant.parse(isoString)
        } catch (e: IllegalArgumentException) {
            return null
        }
    val tz =
        try {
            TimeZone.of(timeZone)
        } catch (e: IllegalArgumentException) {
            return null
        }
    val local = instant.toLocalDateTime(tz)
    return local.hour * 60 + local.minute
}
