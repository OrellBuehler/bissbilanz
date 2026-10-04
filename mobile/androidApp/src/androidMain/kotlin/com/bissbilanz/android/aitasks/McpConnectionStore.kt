package com.bissbilanz.android.aitasks

import android.content.Context
import com.bissbilanz.api.McpConnection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Whether an MCP assistant is connected to the account, and which ones by name. */
data class McpConnectionState(
    val connected: Boolean = false,
    val clientNames: List<String> = emptyList(),
)

/**
 * Last known "does this account have an assistant connected" answer, backing the
 * "send to assistant" gate in `AiMealSheet` and the status line of the connect screen.
 *
 * Fails closed like iOS' `McpConnectionStatus`: the value is read from
 * SharedPreferences straight away and defaults to "not connected", and a [refresh]
 * that throws leaves the last known value in place instead of guessing.
 */
class McpConnectionStore(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("mcp_connection", Context.MODE_PRIVATE)

    private val _state =
        MutableStateFlow(
            McpConnectionState(
                connected = prefs.getBoolean(KEY_CONNECTED, false),
                clientNames = prefs.getStringSet(KEY_CLIENTS, emptySet()).orEmpty().sorted(),
            ),
        )
    val state: StateFlow<McpConnectionState> = _state.asStateFlow()

    /** Failures from [fetch] propagate to the caller; the cached state is untouched. */
    suspend fun refresh(fetch: suspend () -> McpConnection) {
        val connection = fetch()
        val updated =
            McpConnectionState(
                connected = connection.connected,
                clientNames =
                    connection.clients
                        .map { it.name }
                        .distinct()
                        .sorted(),
            )
        prefs
            .edit()
            .putBoolean(KEY_CONNECTED, updated.connected)
            .putStringSet(KEY_CLIENTS, updated.clientNames.toSet())
            .apply()
        _state.value = updated
    }

    private companion object {
        const val KEY_CONNECTED = "connected"
        const val KEY_CLIENTS = "client_names"
    }
}
