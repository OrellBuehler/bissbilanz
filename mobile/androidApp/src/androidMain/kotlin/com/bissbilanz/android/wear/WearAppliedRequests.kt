package com.bissbilanz.android.wear

import android.content.Context
import com.bissbilanz.wear.WearLimits

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
 * messages, so a retry routinely reaches a freshly started process. Bounded by
 * [WearLimits.APPLIED_REQUESTS], which is deliberately larger than the watch's
 * outbox: a full queue arrives as one burst, and a window shorter than the burst
 * would forget the first ids before their own retries land.
 */
internal object WearAppliedRequests {
    private const val PREFS = "wear_applied_requests"
    private const val KEY = "request_ids"
    private const val SEPARATOR = ","

    /**
     * True when [requestId] has not been applied yet, claiming it for this write.
     *
     * The claim happens before the write so two deliveries of the same request
     * can't both write; a write that then fails has to hand the id back with
     * [release], or every retry of it is dropped as a duplicate of a log that
     * never happened.
     */
    @Synchronized
    fun markApplied(
        context: Context,
        requestId: String?,
    ): Boolean {
        // An older watch build sends no id — nothing to deduplicate on, so apply
        // it as before rather than dropping the user's log.
        if (requestId == null) return true

        val applied = read(context)
        if (requestId in applied) return false
        write(context, (applied + requestId).takeLast(WearLimits.APPLIED_REQUESTS))
        return true
    }

    /** Gives a claimed id back after the write failed, so the watch's retry can apply it. */
    @Synchronized
    fun release(
        context: Context,
        requestId: String?,
    ) {
        if (requestId == null) return
        val applied = read(context)
        if (requestId !in applied) return
        write(context, applied.filterNot { it == requestId })
    }

    private fun read(context: Context): List<String> =
        prefs(context)
            .getString(KEY, "")
            .orEmpty()
            .split(SEPARATOR)
            .filter { it.isNotEmpty() }

    private fun write(
        context: Context,
        ids: List<String>,
    ) {
        prefs(context).edit().putString(KEY, ids.joinToString(SEPARATOR)).apply()
    }

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
