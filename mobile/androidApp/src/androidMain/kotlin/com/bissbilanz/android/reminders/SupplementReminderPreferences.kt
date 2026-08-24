package com.bissbilanz.android.reminders

import android.content.Context
import kotlinx.datetime.LocalDate

/**
 * Device-local reminder state. Deliberately not synced: the snooze interval is a
 * per-device preference, and "skip this one today" is a momentary decision about
 * this phone, not a fact about the supplement worth pushing to other devices.
 *
 * The `armed` set exists because [android.app.AlarmManager] cannot be enumerated —
 * without remembering what we scheduled, an alarm for a deleted supplement would be
 * unreachable and keep firing.
 */
class SupplementReminderPreferences(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("supplement_reminders", Context.MODE_PRIVATE)

    /** How long "Remind later" pushes a reminder out. */
    var snoozeMinutes: Int
        get() = prefs.getInt(KEY_SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES)
        set(value) = prefs.edit().putInt(KEY_SNOOZE_MINUTES, value.coerceIn(MIN_SNOOZE, MAX_SNOOZE)).apply()

    /** Slots currently armed with AlarmManager, as `"supplementId|HH:MM"`. */
    var armed: Set<String>
        get() = prefs.getStringSet(KEY_ARMED, emptySet()).orEmpty()

        // getStringSet hands back a live instance the framework may reuse; copy on write.
        set(value) = prefs.edit().putStringSet(KEY_ARMED, value.toSet()).apply()

    fun isSkipped(
        supplementId: String,
        date: LocalDate,
    ): Boolean = skipKey(supplementId, date) in skipped

    fun markSkipped(
        supplementId: String,
        date: LocalDate,
    ) {
        skipped = pruneSkips(skipped + skipKey(supplementId, date), date)
    }

    /** Drops skip markers older than [SKIP_RETENTION_DAYS] so the set can't grow forever. */
    fun pruneSkips(today: LocalDate) {
        val current = skipped
        val pruned = pruneSkips(current, today)
        if (pruned != current) skipped = pruned
    }

    private var skipped: Set<String>
        get() = prefs.getStringSet(KEY_SKIPPED, emptySet()).orEmpty()
        set(value) = prefs.edit().putStringSet(KEY_SKIPPED, value.toSet()).apply()

    private fun pruneSkips(
        entries: Set<String>,
        today: LocalDate,
    ): Set<String> {
        val cutoff = LocalDate.fromEpochDays(today.toEpochDays() - SKIP_RETENTION_DAYS)
        return entries
            .filter { entry ->
                val date = entry.substringAfterLast(':', "").let { runCatching { LocalDate.parse(it) }.getOrNull() }
                // Keep anything unparseable rather than silently dropping a live skip.
                date == null || date >= cutoff
            }.toSet()
    }

    private fun skipKey(
        supplementId: String,
        date: LocalDate,
    ) = "$supplementId:$date"

    companion object {
        const val DEFAULT_SNOOZE_MINUTES = 15
        const val MIN_SNOOZE = 1
        const val MAX_SNOOZE = 24 * 60

        /** Presets offered in Settings; matches the iOS picker so the two apps read alike. */
        val SNOOZE_PRESETS = listOf(5, 10, 15, 30, 60, 120, 180)

        private const val SKIP_RETENTION_DAYS = 2
        private const val KEY_SNOOZE_MINUTES = "snooze_minutes"
        private const val KEY_SKIPPED = "skipped"
        private const val KEY_ARMED = "armed"
    }
}
