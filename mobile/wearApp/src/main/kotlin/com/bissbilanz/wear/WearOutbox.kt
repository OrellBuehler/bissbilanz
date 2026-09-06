package com.bissbilanz.wear

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** One watch → phone write waiting for the phone to come back into range. */
@Serializable
data class WearOutboxItem(
    /** Local ordering key; also what identifies the item for removal after it lands. */
    val id: Long,
    val path: String,
    /** The exact JSON that would have been sent, request id and all. */
    val payload: String,
)

/**
 * Durable FIFO queue for writes made while the phone was unreachable.
 *
 * A watch log is a real entry the user believes they made, so dropping it when
 * no node answers loses data silently. It is persisted rather than held in
 * memory because the watch app is killed aggressively — the queue has to
 * survive that and flush on the next connection, like watchOS's
 * `transferUserInfo` fallback.
 *
 * The stored payload is the encoded request itself, so a flush re-sends the
 * exact same request id and the phone can tell a retry from a new log.
 */
object WearOutbox {
    private const val PREFS = "wear_outbox"
    private const val KEY_ITEMS = "items"
    private const val KEY_NEXT_ID = "next_id"

    /** Past this the watch is holding weeks of unsent logs; keep the newest. */
    private const val LIMIT = 100

    private val json = Json { ignoreUnknownKeys = true }

    @Synchronized
    fun enqueue(
        context: Context,
        path: String,
        payload: String,
    ): Boolean =
        runCatching {
            val prefs = prefs(context)
            val nextId = prefs.getLong(KEY_NEXT_ID, 1L)
            val items = (read(context) + WearOutboxItem(id = nextId, path = path, payload = payload)).takeLast(LIMIT)
            prefs
                .edit()
                .putString(KEY_ITEMS, json.encodeToString(items))
                .putLong(KEY_NEXT_ID, nextId + 1)
                .apply()
            true
        }.getOrDefault(false)

    @Synchronized
    fun all(context: Context): List<WearOutboxItem> = read(context)

    @Synchronized
    fun remove(
        context: Context,
        id: Long,
    ) {
        runCatching {
            val remaining = read(context).filterNot { it.id == id }
            prefs(context).edit().putString(KEY_ITEMS, json.encodeToString(remaining)).apply()
        }
    }

    @Synchronized
    fun size(context: Context): Int = read(context).size

    private fun read(context: Context): List<WearOutboxItem> =
        runCatching {
            prefs(context).getString(KEY_ITEMS, null)?.let { json.decodeFromString<List<WearOutboxItem>>(it) }
        }.getOrNull() ?: emptyList()

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
