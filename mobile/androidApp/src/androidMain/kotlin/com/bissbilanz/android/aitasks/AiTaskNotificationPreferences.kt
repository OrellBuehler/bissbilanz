package com.bissbilanz.android.aitasks

import android.content.Context

/**
 * Which dismissals and answers this device has already announced, and which changed
 * answers have already refreshed the diary.
 *
 * Server-side acknowledgement is what clears the badge, and that only happens when the
 * user opens the list — so without a device-local record every refresh in between would
 * re-raise the same notification. Keeping it local is also what lets each of the user's
 * devices tell them once.
 */
class AiTaskNotificationPreferences(
    context: Context,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val prefs = context.getSharedPreferences("ai_task_notifications", Context.MODE_PRIVATE)

    /** Task ids already shown as a notification on this device. */
    var notified: Set<String>
        get() = prefs.getStringSet(KEY_NOTIFIED, emptySet()).orEmpty()

        // getStringSet hands back a live instance the framework may reuse; copy on write.
        set(value) = prefs.edit().putStringSet(KEY_NOTIFIED, value.toSet()).apply()

    /**
     * Records [ids] as announced and drops anything the server no longer returns, so the
     * set cannot grow without bound as old tasks are cleaned up after 30 days.
     */
    fun markNotified(
        ids: Collection<String>,
        knownIds: Set<String>,
    ) {
        notified = (notified + ids).filterTo(mutableSetOf()) { it in knownIds }
    }

    fun unnotified(ids: Collection<String>): List<String> {
        val seen = notified
        return ids.filterNot { it in seen }
    }

    fun unannouncedReplies(ids: Collection<String>): List<String> = unrecorded(KEY_ANNOUNCED_REPLIES, ids)

    fun markRepliesAnnounced(ids: Collection<String>) = record(KEY_ANNOUNCED_REPLIES, ids)

    fun unrefreshedChanges(ids: Collection<String>): List<String> = unrecorded(KEY_REFRESHED_CHANGES, ids)

    fun markChangesRefreshed(ids: Collection<String>) = record(KEY_REFRESHED_CHANGES, ids)

    @Synchronized
    private fun unrecorded(
        key: String,
        ids: Collection<String>,
    ): List<String> {
        val recorded = timestamps(key)
        return ids.filterNot { it in recorded }
    }

    @Synchronized
    private fun record(
        key: String,
        ids: Collection<String>,
    ) {
        if (ids.isEmpty()) return
        val now = clock()
        val kept = timestamps(key).filterValues { now - it < RETENTION_MS }
        val updated = kept + ids.filterNot { it in kept }.associateWith { now }
        prefs.edit().putStringSet(key, updated.mapTo(mutableSetOf()) { (id, at) -> "$id$SEPARATOR$at" }).apply()
    }

    private fun timestamps(key: String): Map<String, Long> =
        prefs.getStringSet(key, emptySet()).orEmpty().associate { entry ->
            val split = entry.lastIndexOf(SEPARATOR)
            if (split < 0) entry to 0L else entry.substring(0, split) to (entry.substring(split + 1).toLongOrNull() ?: 0L)
        }

    private companion object {
        const val KEY_NOTIFIED = "notified_ids"
        const val KEY_ANNOUNCED_REPLIES = "announced_reply_ids"
        const val KEY_REFRESHED_CHANGES = "refreshed_change_ids"
        const val SEPARATOR = '|'
        const val RETENTION_MS = 45L * 24 * 60 * 60 * 1000
    }
}
