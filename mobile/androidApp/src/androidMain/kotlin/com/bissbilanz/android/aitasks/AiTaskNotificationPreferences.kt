package com.bissbilanz.android.aitasks

import android.content.Context

/**
 * Which dismissals this device has already announced.
 *
 * Server-side acknowledgement is what clears the badge, and that only happens when the
 * user opens the list — so without a device-local record every refresh in between would
 * re-raise the same notification. Keeping it local is also what lets each of the user's
 * devices tell them once.
 */
class AiTaskNotificationPreferences(
    context: Context,
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

    private companion object {
        const val KEY_NOTIFIED = "notified_ids"
    }
}
