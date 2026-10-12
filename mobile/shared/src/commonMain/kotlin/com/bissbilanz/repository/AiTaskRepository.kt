package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskUpdate
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * AI tasks, held in memory rather than in SQLDelight.
 *
 * Deliberately not the offline-first pattern the other repositories use: a task is
 * only ever resolved elsewhere (the MCP assistant, Claude on the server, or the user's
 * iPhone), so a local mirror could never be authoritative and there is nothing to
 * queue — the web client made the same call and skips its Dexie mirror. In Local mode
 * the queue does not exist at all.
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

    /**
     * Edits a still-open task. [clearedKeys] names the fields (from [com.bissbilanz.util.AiTaskField])
     * the caller is deliberately emptying, e.g. removing the meal type — see
     * [BissbilanzApi.updateAiTask] for why an omitted field cannot do that on its own.
     */
    suspend fun update(
        id: String,
        update: AiTaskUpdate,
        clearedKeys: Collection<String> = emptyList(),
    ): AiTask {
        val updated = api.updateAiTask(id, update, clearedKeys = clearedKeys)
        _tasks.value = _tasks.value.map { if (it.id == id) updated else it }
        return updated
    }

    /** Gives up on a still-open task, the same status change the web list's dismiss button makes. */
    suspend fun dismiss(id: String): AiTask = update(id, AiTaskUpdate(status = AiTaskUpdate.Status.dismissed))

    /**
     * Logs a Claude proposal and swaps in the resolved task. A 409, 404 or 400 means the proposal is
     * gone (accepted elsewhere, processor switched, or a proposed food was deleted): the
     * list is re-read so the card disappears, then the exception is rethrown for the
     * caller to explain. Any other failure leaves the list untouched.
     */
    suspend fun acceptProposal(
        id: String,
        itemIds: List<String>,
    ): AiTask {
        try {
            val accepted = api.acceptAiTaskProposal(id, itemIds)
            _tasks.value = _tasks.value.map { if (it.id == id) accepted else it }
            return accepted
        } catch (e: ApiException) {
            if (e.statusCode == 409 || e.statusCode == 404 || e.statusCode == 400) {
                try {
                    refresh()
                } catch (refreshError: Exception) {
                    if (refreshError is kotlinx.coroutines.CancellationException) throw refreshError
                    e.addSuppressed(refreshError)
                }
            }
            throw e
        }
    }

    /** Uploads new photos for an edit, ahead of [update] — mirrors how a new task's photos go up first. */
    suspend fun uploadPhotos(photos: List<Pair<String, ByteArray>>): List<String> = api.uploadAiTaskPhotos(photos)

    fun unreadCount(): Int = _tasks.value.count { it.isUnreadDismissal() }
}

fun AiTask.isUnreadDismissal(): Boolean = status == AiTask.Status.dismissed && acknowledgedAt == null
