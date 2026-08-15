package com.bissbilanz.wear

import android.content.Context
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.NodeClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.Json

/**
 * The watch's view of the phone's state, plus the outbound log commands.
 *
 * A watch has no account, no database and no network of its own here: the phone
 * pushes a [WearState] DataItem and the watch sends back short messages the phone
 * turns into real writes. That mirrors how the Apple Watch app works.
 */
object WearStateRepository {
    private val json = Json { ignoreUnknownKeys = true }

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
    ): Boolean = send(context, WearPaths.LOG_FOOD, json.encodeToString(request))

    suspend fun logWeight(
        context: Context,
        request: WearWeightLogRequest,
    ): Boolean = send(context, WearPaths.LOG_WEIGHT, json.encodeToString(request))

    suspend fun logSleep(
        context: Context,
        request: WearSleepLogRequest,
    ): Boolean = send(context, WearPaths.LOG_SLEEP, json.encodeToString(request))

    suspend fun requestState(context: Context) {
        send(context, WearPaths.REQUEST_STATE, "")
    }

    /**
     * Sends [payload] to every connected node. Returns true when at least one node
     * accepted it — the phone may simply be out of range, which the UI surfaces
     * rather than silently dropping the log.
     */
    private suspend fun send(
        context: Context,
        path: String,
        payload: String,
    ): Boolean =
        runCatching {
            val nodeClient: NodeClient = Wearable.getNodeClient(context)
            val messageClient: MessageClient = Wearable.getMessageClient(context)
            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) return false
            nodes.forEach { node ->
                messageClient.sendMessage(node.id, path, payload.toByteArray()).await()
            }
            true
        }.getOrDefault(false)
}
