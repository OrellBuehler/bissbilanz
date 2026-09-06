package com.bissbilanz.android.wear

import android.content.Context

/**
 * The ids of watch requests already written, newest last.
 *
 * The watch re-sends whenever a request's answer doesn't come back, and it cannot
 * tell "the phone never got this" from "the phone wrote it but the answer was
 * lost" — an RPC that times out falls back to a plain message, and the watch's
 * offline outbox retries whatever it could not confirm. So the same log can
 * arrive twice, and without this the user gets two dinners.
 *
 * Persisted rather than held in memory: a listener service is torn down between
 * messages, so a retry routinely reaches a freshly started process. Bounded — a
 * request older than the last [LIMIT] is long past any retry window, and the list
 * must not grow forever in a preference file.
 */
internal object WearAppliedRequests {
    private const val PREFS = "wear_applied_requests"
    private const val KEY = "request_ids"
    private const val SEPARATOR = ","
    private const val LIMIT = 64

    /** True when [requestId] has not been applied yet, recording it as applied. */
    @Synchronized
    fun markApplied(
        context: Context,
        requestId: String?,
    ): Boolean {
        // An older watch build sends no id — nothing to deduplicate on, so apply
        // it as before rather than dropping the user's log.
        if (requestId == null) return true

        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val applied =
            prefs
                .getString(KEY, "")
                .orEmpty()
                .split(SEPARATOR)
                .filter { it.isNotEmpty() }
        if (requestId in applied) return false
        prefs
            .edit()
            .putString(KEY, (applied + requestId).takeLast(LIMIT).joinToString(SEPARATOR))
            .apply()
        return true
    }
}
