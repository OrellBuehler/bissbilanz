package com.bissbilanz.sync

import com.bissbilanz.auth.AuthManager
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SyncState(
    val isSyncing: Boolean = false,
    val pendingCount: Long = 0,
    val lastSyncedAt: Long? = null,
    val errors: List<String> = emptyList(),
)

class SyncManager(
    private val syncQueue: SyncQueue,
    private val connectivityProvider: ConnectivityProvider,
    private val authManager: AuthManager,
    private val baseUrl: String,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val client =
        HttpClient {
            followRedirects = true
        }

    private val _state = MutableStateFlow(SyncState())
    val state: StateFlow<SyncState> = _state.asStateFlow()

    private val retryCounts = mutableMapOf<Long, Int>()

    fun startNetworkListener(onSynced: (() -> Unit)? = null) {
        scope.launch {
            // Update pending count on start
            _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())

            connectivityProvider.isOnline.collect { online ->
                if (online) {
                    val count = syncPendingQueue()
                    if (count > 0) onSynced?.invoke()
                }
            }
        }
    }

    suspend fun syncPendingQueue(): Int {
        if (_state.value.isSyncing || !connectivityProvider.isOnline.value) return 0

        _state.value = _state.value.copy(isSyncing = true, errors = emptyList())
        var synced = 0

        try {
            val queued = syncQueue.drain()
            _state.value = _state.value.copy(pendingCount = queued.size.toLong())

            for (req in queued) {
                try {
                    val token = authManager.getAccessToken()
                    val response =
                        client.request("$baseUrl${req.url}") {
                            method = HttpMethod.parse(req.method)
                            if (token != null) {
                                header(HttpHeaders.Authorization, "Bearer $token")
                            }
                            if (req.method != "DELETE") {
                                contentType(ContentType.Application.Json)
                                setBody(req.body)
                            }
                        }

                    when {
                        response.status.isSuccess() -> {
                            syncQueue.remove(req.id)
                            retryCounts.remove(req.id)
                            synced++
                        }
                        response.status == HttpStatusCode.Unauthorized ||
                            response.status == HttpStatusCode.Forbidden -> {
                            if (authManager.refreshToken()) {
                                // Retry once with new token
                                val retryToken = authManager.getAccessToken()
                                val retry =
                                    client.request("$baseUrl${req.url}") {
                                        method = HttpMethod.parse(req.method)
                                        if (retryToken != null) {
                                            header(HttpHeaders.Authorization, "Bearer $retryToken")
                                        }
                                        if (req.method != "DELETE") {
                                            contentType(ContentType.Application.Json)
                                            setBody(req.body)
                                        }
                                    }
                                if (retry.status.isSuccess()) {
                                    syncQueue.remove(req.id)
                                    retryCounts.remove(req.id)
                                    synced++
                                } else {
                                    addError("Session expired. Please log in again to sync pending changes.")
                                    break
                                }
                            } else {
                                addError("Session expired. Please log in again to sync pending changes.")
                                break
                            }
                        }
                        response.status.value in 400..499 -> {
                            // Client error — unrecoverable, discard
                            syncQueue.remove(req.id)
                            retryCounts.remove(req.id)
                            synced++
                            addError("Failed to sync ${req.method} ${req.url}: HTTP ${response.status.value}")
                        }
                        else -> {
                            // Server error (5xx) — retry up to MAX_RETRIES
                            val count = (retryCounts[req.id] ?: 0) + 1
                            retryCounts[req.id] = count
                            if (count >= MAX_RETRIES) {
                                syncQueue.remove(req.id)
                                retryCounts.remove(req.id)
                                synced++
                                addError(
                                    "Gave up syncing ${req.method} ${req.url} after $MAX_RETRIES retries.",
                                )
                            } else {
                                break
                            }
                        }
                    }

                    _state.value = _state.value.copy(pendingCount = (queued.size - synced).toLong())
                } catch (_: Exception) {
                    // Network error — stop and retry later
                    break
                }
            }
        } finally {
            val pending = syncQueue.pendingCount()
            _state.value =
                _state.value.copy(
                    isSyncing = false,
                    pendingCount = pending,
                    lastSyncedAt =
                        if (synced > 0) {
                            kotlinx.datetime.Clock.System
                                .now()
                                .toEpochMilliseconds()
                        } else {
                            _state.value.lastSyncedAt
                        },
                )
        }

        return synced
    }

    private fun addError(message: String) {
        _state.value = _state.value.copy(errors = _state.value.errors + message)
    }

    companion object {
        private const val MAX_RETRIES = 3
    }
}
