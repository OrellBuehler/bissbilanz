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
 *
 * Every write is committed synchronously. `apply()` returns before the file is
 * written, and this class exists precisely for the case where the process does
 * not survive the next second.
 */
object WearOutbox {
    private const val PREFS = "wear_outbox"
    private const val KEY_ITEMS = "items"
    private const val KEY_NEXT_ID = "next_id"

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * The queue with [item] appended, or null when it is already full.
     *
     * A full queue refuses the new write rather than making room by dropping the
     * oldest: that write was already reported to the user as queued, and
     * destroying it while answering "queued" for its replacement is exactly the
     * silent loss this queue exists to prevent. A refusal surfaces as a failed
     * log the user can make again.
     */
    internal fun appended(
        items: List<WearOutboxItem>,
        item: WearOutboxItem,
    ): List<WearOutboxItem>? = if (items.size >= WearLimits.OUTBOX) null else items + item

    /** Queues a write, returning its id, or null when nothing could be stored. */
    @Synchronized
    fun enqueue(
        context: Context,
        path: String,
        payload: String,
    ): Long? =
        runCatching {
            val prefs = prefs(context)
            val nextId = prefs.getLong(KEY_NEXT_ID, 1L)
            val items =
                appended(read(context), WearOutboxItem(id = nextId, path = path, payload = payload))
                    ?: return@runCatching null
            val stored =
                prefs
                    .edit()
                    .putString(KEY_ITEMS, json.encodeToString(items))
                    .putLong(KEY_NEXT_ID, nextId + 1)
                    .commit()
            if (stored) nextId else null
        }.getOrNull()

    @Synchronized
    fun all(context: Context): List<WearOutboxItem> = read(context)

    @Synchronized
    fun remove(
        context: Context,
        id: Long,
    ) {
        runCatching {
            val remaining = read(context).filterNot { it.id == id }
            prefs(context).edit().putString(KEY_ITEMS, json.encodeToString(remaining)).commit()
        }
    }

    /** True while [id] is still waiting for the phone — how a send tells SENT from QUEUED. */
    @Synchronized
    fun contains(
        context: Context,
        id: Long,
    ): Boolean = read(context).any { it.id == id }

    @Synchronized
    fun size(context: Context): Int = read(context).size

    private fun read(context: Context): List<WearOutboxItem> =
        runCatching {
            prefs(context).getString(KEY_ITEMS, null)?.let { json.decodeFromString<List<WearOutboxItem>>(it) }
        }.getOrNull() ?: emptyList()

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
