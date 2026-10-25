package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadQueue
import com.bissbilanz.android.aitasks.QueuedAiTaskUpload
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.util.ClaudeTaskState
import com.bissbilanz.util.claudeTaskState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AiTasksViewModel(
    private val aiTaskRepo: AiTaskRepository,
    private val uploadQueue: AiTaskUploadQueue,
    private val errorReporter: ErrorReporter,
    private val entryRepo: EntryRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    enum class Filter(
        @StringRes val emptyMessage: Int,
    ) {
        OPEN(R.string.ai_tasks_empty_open),
        COMPLETED(R.string.ai_tasks_empty_completed),
        DISMISSED(R.string.ai_tasks_empty_dismissed),
        ;

        fun matches(task: AiTask): Boolean =
            when (this) {
                OPEN -> task.status == AiTask.Status.pending
                COMPLETED -> task.status == AiTask.Status.completed
                DISMISSED -> task.status == AiTask.Status.dismissed
            }
    }

    // Backed by SavedStateHandle so the chosen tab survives process death.
    val filter: StateFlow<Filter> =
        savedStateHandle
            .getStateFlow(KEY_FILTER, Filter.OPEN.name)
            .map { runCatching { Filter.valueOf(it) }.getOrDefault(Filter.OPEN) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Filter.OPEN)

    val visibleTasks: StateFlow<List<AiTask>> =
        combine(aiTaskRepo.tasks, filter) { tasks, active -> tasks.filter { active.matches(it) } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Meals still queued for upload, shown only on the Open tab like their iOS counterpart. */
    val queuedUploads: StateFlow<List<QueuedAiTaskUpload>> =
        combine(uploadQueue.items, filter) { uploads, active -> if (active == Filter.OPEN) uploads else emptyList() }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun selectFilter(value: Filter) {
        savedStateHandle[KEY_FILTER] = value.name
        savedStateHandle[KEY_FILTER_CHOSEN] = true
    }

    private val _loadFailed = MutableStateFlow(false)
    val loadFailed: StateFlow<Boolean> = _loadFailed.asStateFlow()

    /** Initial load: pull, then clear the unread badge because the user is looking at it. */
    fun load() {
        viewModelScope.launch {
            _isLoading.value = true
            _loadFailed.value = false
            try {
                aiTaskRepo.refresh()
                // Show the tab holding what the user came here for. Opening from a
                // dismissal notification would otherwise land on Open, which by
                // definition cannot contain the task they just tapped. A separate key,
                // because getStateFlow already stored the default under KEY_FILTER.
                if (savedStateHandle.get<Boolean>(KEY_FILTER_CHOSEN) != true &&
                    aiTaskRepo.unreadCount() > 0
                ) {
                    savedStateHandle[KEY_FILTER] = Filter.DISMISSED.name
                }
                aiTaskRepo.acknowledgeAll()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _loadFailed.value = true
                errorReporter.captureException(e)
            }
            _isLoading.value = false
        }
    }

    /** Suspends so pull-to-refresh keeps its spinner up until the pull actually ends. */
    suspend fun refresh() {
        _loadFailed.value = false
        try {
            aiTaskRepo.refresh()
            aiTaskRepo.acknowledgeAll()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            _loadFailed.value = true
            errorReporter.captureException(e)
        }
    }

    /**
     * While any pending task is queued, running or retrying on Claude's side, re-reads the list
     * every [POLL_INTERVAL_MS]. Runs until cancelled; the screen launches it only while visible.
     * A failed read is already reported by the repository; the next tick retries.
     */
    suspend fun pollWhileClaudeWorks() {
        aiTaskRepo.tasks
            .map { tasks -> tasks.any { it.claudeTaskState() in ACTIVE_STATES } }
            .distinctUntilChanged()
            .collectLatest { active ->
                while (active) {
                    delay(POLL_INTERVAL_MS)
                    try {
                        aiTaskRepo.refresh()
                        aiTaskRepo.acknowledgeAll(quiet = true)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        // The repository already reported the failure; the next tick retries.
                    }
                }
            }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            runCatching { aiTaskRepo.delete(id) }
                .onFailure { errorReporter.captureException(it as? Exception ?: Exception(it)) }
        }
    }

    private val _busyTaskId = MutableStateFlow<String?>(null)

    /** The task whose proposal is being logged or discarded; its buttons are disabled meanwhile. */
    val busyTaskId: StateFlow<String?> = _busyTaskId.asStateFlow()

    private val _messages = MutableSharedFlow<Int>(extraBufferCapacity = 1)

    /** One-shot snackbar messages as string resource ids, resolved by the screen. */
    val messages: SharedFlow<Int> = _messages.asSharedFlow()

    /**
     * Logs exactly the given [itemIds] of a Claude proposal. A failure keeps the card
     * and the caller's selection so the user can retry. A 409, 404 or 400 means the proposal is
     * gone: the repository has already re-read the list, and this is an expected outcome,
     * not an error to report. A 429 is a rate limit and likewise not reported.
     */
    fun acceptProposal(
        taskId: String,
        itemIds: List<String>,
    ) {
        if (_busyTaskId.value != null) return
        _busyTaskId.value = taskId
        viewModelScope.launch {
            var loggedOn: String? = null
            try {
                loggedOn = aiTaskRepo.acceptProposal(taskId, itemIds).date
                _messages.emit(R.string.ai_tasks_proposal_logged)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                when {
                    e.isProposalGone() || (e is ApiException && e.statusCode == 400) ->
                        _messages.emit(R.string.ai_tasks_proposal_accept_conflict)
                    e is ApiException && e.statusCode == 429 -> _messages.emit(R.string.ai_tasks_proposal_accept_failed)
                    else -> {
                        errorReporter.captureException(e)
                        _messages.emit(R.string.ai_tasks_proposal_accept_failed)
                    }
                }
            } finally {
                _busyTaskId.value = null
            }
            loggedOn?.let { refreshEntries(it) }
        }
    }

    fun discardProposal(taskId: String) {
        if (_busyTaskId.value != null) return
        _busyTaskId.value = taskId
        viewModelScope.launch {
            try {
                aiTaskRepo.dismiss(taskId)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (e.isProposalGone()) {
                    refreshTasksAfterConflict()
                    _messages.emit(R.string.ai_tasks_proposal_accept_conflict)
                } else {
                    errorReporter.captureException(e)
                    _messages.emit(R.string.ai_task_save_failed)
                }
            } finally {
                _busyTaskId.value = null
            }
        }
    }

    private fun Exception.isProposalGone() = this is ApiException && (statusCode == 409 || statusCode == 404)

    private suspend fun refreshTasksAfterConflict() {
        try {
            aiTaskRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private suspend fun refreshEntries(date: String) {
        try {
            entryRepo.refresh(date)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    companion object {
        private const val KEY_FILTER = "ai_tasks_filter"
        private const val KEY_FILTER_CHOSEN = "ai_tasks_filter_chosen"
        const val POLL_INTERVAL_MS = 10_000L
        private val ACTIVE_STATES = setOf(ClaudeTaskState.QUEUED, ClaudeTaskState.RUNNING, ClaudeTaskState.RETRYING)
    }
}
