package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * AI tasks, held in memory rather than in SQLDelight.
 *
 * Deliberately not the offline-first pattern the other repositories use: a task is
 * only ever resolved by the MCP assistant server-side, so a local mirror could never
 * be authoritative and there is nothing to queue — the web client made the same call
 * and skips its Dexie mirror. In Local mode the queue does not exist at all.
 */
class AiTaskRepository(
    private val api: BissbilanzApi,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    private val _tasks = MutableStateFlow<List<AiTask>>(emptyList())
    val tasks: StateFlow<List<AiTask>> = _tasks.asStateFlow()

    /**
     * Fired after a refresh with the dismissals the user has not acknowledged yet.
     * Android turns these into local notifications; suppressing repeats is the
     * caller's job, since acknowledgement only happens when the list is opened.
     */
    var onUnreadDismissals: ((unread: List<AiTask>, knownIds: Set<String>) -> Unit)? = null

    /**
     * Rethrows after reporting so callers can react — the list screen shows a failure
     * instead of an empty "you're all caught up", and the poll worker can retry.
     * Fan-out callers wrap this in their own catch.
     */
    suspend fun refresh() {
        if (appModeManager.isLocal) return
        try {
            val response = api.listAiTasks(limit = 100)
            _tasks.value = response.tasks
            val unread = response.tasks.filter { it.isUnreadDismissal() }
            if (unread.isNotEmpty()) {
                onUnreadDismissals?.invoke(unread, response.tasks.mapTo(mutableSetOf()) { it.id })
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            throw e
        }
    }

    /**
     * Clears the unread badge for every resolved task. Called when the user opens the
     * list — posting a notification does not count as reading it, which is what lets
     * each device announce the same dismissal once.
     */
    suspend fun acknowledgeAll() {
        if (appModeManager.isLocal) return
        if (_tasks.value.none { it.isUnreadDismissal() }) return
        try {
            api.acknowledgeAiTasks()
            refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun delete(id: String) {
        if (appModeManager.isLocal) return
        api.deleteAiTask(id)
        _tasks.value = _tasks.value.filterNot { it.id == id }
    }

    fun unreadCount(): Int = _tasks.value.count { it.isUnreadDismissal() }
}

fun AiTask.isUnreadDismissal(): Boolean = status == AiTask.Status.dismissed && acknowledgedAt == null
