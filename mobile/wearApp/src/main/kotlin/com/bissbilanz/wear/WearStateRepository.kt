package com.bissbilanz.wear

import android.content.Context
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.NodeClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json

/** What actually happened to a write the user made on the watch. */
enum class WearSendResult {
    /** The phone has it. */
    SENT,

    /** The phone was out of range; the write is queued and goes out on reconnect. */
    QUEUED,

    /** Neither possible — the write is lost, and the UI has to say so. */
    FAILED,
}

/**
 * The watch's view of the phone's state, plus the outbound log commands.
 *
 * A watch has no account, no database and no network of its own here: the phone
 * pushes a [WearState] DataItem and the watch sends back short messages the phone
 * turns into real writes. That mirrors how the Apple Watch app works.
 *
 * Sends prefer the Data Layer's RPC (`sendRequest`), whose response body is the
 * phone's refreshed [WearState] — applying it moves the rings the moment a log
 * lands rather than at the phone's next push. A phone build with no RPC service
 * registered falls back to a plain message, and a phone that isn't there at all
 * falls back to [WearOutbox].
 */
object WearStateRepository {
    private val json = Json { ignoreUnknownKeys = true }

    /** A write runs a repository write and a full state rebuild on the phone. */
    private const val REQUEST_TIMEOUT_MS = 10_000L
    private const val MESSAGE_TIMEOUT_MS = 5_000L

    private val _state = MutableStateFlow<WearState?>(null)
    val state: StateFlow<WearState?> = _state.asStateFlow()

    fun update(state: WearState) {
        _state.value = state
    }

    /** Reads whatever DataItem is already on the watch, so a cold start shows data immediately. */
    suspend fun loadCached(context: Context) {
        runCatching {
            val client: DataClient = Wearable.getDataClient(context)
            val items = client.dataItems.await()
            try {
                items
                    .firstOrNull { it.uri.path == WearPaths.STATE }
                    ?.let { item ->
                        DataMapItem
                            .fromDataItem(item)
                            .dataMap
                            .getString(WearPaths.KEY_PAYLOAD)
                            ?.let { payload -> _state.value = json.decodeFromString<WearState>(payload) }
                    }
            } finally {
                items.release()
            }
        }
    }

    fun decode(payload: String): WearState? = runCatching { json.decodeFromString<WearState>(payload) }.getOrNull()

    suspend fun logFood(
        context: Context,
        request: WearLogRequest,
    ): WearSendResult = submit(context, WearPaths.LOG_FOOD, json.encodeToString(request))

    suspend fun logWeight(
        context: Context,
        request: WearWeightLogRequest,
    ): WearSendResult = submit(context, WearPaths.LOG_WEIGHT, json.encodeToString(request))

    suspend fun logSleep(
        context: Context,
        request: WearSleepLogRequest,
    ): WearSendResult = submit(context, WearPaths.LOG_SLEEP, json.encodeToString(request))

    /**
     * Asks the phone for a fresh state. Never queued: a state request that
     * arrives an hour late is worth nothing, and the phone pushes on every
     * change anyway.
     */
    suspend fun requestState(context: Context) {
        deliver(context, WearPaths.REQUEST_STATE, "")
    }

    /** How many writes are waiting for the phone, for the UI to be honest about. */
    fun pendingCount(context: Context): Int = WearOutbox.size(context)

    /**
     * Sends everything queued while the phone was away, oldest first, and stops at
     * the first one that doesn't land so the order is never broken. Returns true
     * when the queue is empty afterwards.
     */
    suspend fun flushOutbox(context: Context): Boolean {
        val pending = withContext(Dispatchers.IO) { WearOutbox.all(context) }
        if (pending.isEmpty()) return true
        for (item in pending) {
            if (!deliver(context, item.path, item.payload)) return false
            withContext(Dispatchers.IO) { WearOutbox.remove(context, item.id) }
        }
        return true
    }

    private suspend fun submit(
        context: Context,
        path: String,
        payload: String,
    ): WearSendResult {
        // Anything already queued goes first: the phone must see the day's writes
        // in the order they were made.
        if (!flushOutbox(context)) return enqueue(context, path, payload)
        return if (deliver(context, path, payload)) WearSendResult.SENT else enqueue(context, path, payload)
    }

    private suspend fun enqueue(
        context: Context,
        path: String,
        payload: String,
    ): WearSendResult =
        withContext(Dispatchers.IO) {
            if (WearOutbox.enqueue(context, path, payload)) WearSendResult.QUEUED else WearSendResult.FAILED
        }

    /**
     * Hands [payload] to every connected node, RPC first. Returns true when at
     * least one node took it; the phone may simply be out of range, which the
     * caller queues rather than losing.
     */
    private suspend fun deliver(
        context: Context,
        path: String,
        payload: String,
    ): Boolean {
        val nodeClient: NodeClient = Wearable.getNodeClient(context)
        val nodes = attempt { nodeClient.connectedNodes.await() }.orEmpty()
        if (nodes.isEmpty()) return false

        val messageClient: MessageClient = Wearable.getMessageClient(context)
        val bytes = payload.toByteArray()
        var delivered = false
        nodes.forEach { node ->
            val response =
                attempt {
                    withTimeoutOrNull(REQUEST_TIMEOUT_MS) { messageClient.sendRequest(node.id, path, bytes).await() }
                }
            if (response != null) {
                delivered = true
                applyResponse(response)
                return@forEach
            }
            // No RPC service on the other side (an older phone build), or the
            // answer was lost. The message path has no response, so the rings
            // wait for the phone's push — but the write itself still lands, and
            // the request id keeps a double delivery from double-logging.
            val sent =
                attempt {
                    withTimeoutOrNull(MESSAGE_TIMEOUT_MS) { messageClient.sendMessage(node.id, path, bytes).await() }
                }
            if (sent != null) delivered = true
        }
        return delivered
    }

    /** The phone answers a write with the state it just rebuilt; show it at once. */
    private fun applyResponse(body: ByteArray) {
        if (body.isEmpty()) return
        decode(String(body))?.let(::update)
    }

    /**
     * Runs [block], turning a Data Layer failure into null while letting a real
     * cancellation through — a `runCatching` here would swallow the cancellation
     * of the composable that started the send.
     */
    private suspend fun <T> attempt(block: suspend () -> T): T? =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
}
