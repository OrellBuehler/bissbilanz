package com.bissbilanz.android.reminders

import android.content.Context
import kotlinx.datetime.LocalDate

/**
 * Device-local state for general logging reminders (weight / meal / sleep) — its own
 * SharedPreferences file, parallel to [SupplementReminderPreferences], so a reschedule of
 * one kind never touches the other's armed registry.
 *
 * "Skip this one today" is a momentary, per-device decision, not something worth pushing
 * to other devices — same reasoning as [SupplementReminderPreferences.isSkipped].
 */
class ReminderPreferences(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("logging_reminders", Context.MODE_PRIVATE)

    /** Slots currently armed with AlarmManager, as [ReminderScheduler.slotKey] values. */
    var armed: Set<String>
        get() = prefs.getStringSet(KEY_ARMED, emptySet()).orEmpty()

        // getStringSet hands back a live instance the framework may reuse; copy on write.
        set(value) = prefs.edit().putStringSet(KEY_ARMED, value.toSet()).apply()

    fun isSkipped(
        reminderId: String,
        date: LocalDate,
    ): Boolean = skipKey(reminderId, date) in skipped

    fun markSkipped(
        reminderId: String,
        date: LocalDate,
    ) {
        skipped = pruneSkips(skipped + skipKey(reminderId, date), date)
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
        reminderId: String,
        date: LocalDate,
    ) = "$reminderId:$date"

    companion object {
        private const val SKIP_RETENTION_DAYS = 2
        private const val KEY_SKIPPED = "skipped"
        private const val KEY_ARMED = "armed"
    }
}
