package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadQueue
import com.bissbilanz.android.aitasks.QueuedAiTaskUpload
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AiTasksViewModel(
    private val aiTaskRepo: AiTaskRepository,
    private val uploadQueue: AiTaskUploadQueue,
    private val errorReporter: ErrorReporter,
    private val refreshManager: RefreshManager,
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
    }

    private val _loadFailed = MutableStateFlow(false)
    val loadFailed: StateFlow<Boolean> = _loadFailed.asStateFlow()

    /** Initial load: pull, then clear the unread badge because the user is looking at it. */
    fun load() {
        viewModelScope.launch {
            _isLoading.value = true
            _loadFailed.value = false
            runCatching {
                aiTaskRepo.refresh()
                // Show the tab holding what the user came here for. Opening from a
                // dismissal notification would otherwise land on Open, which by
                // definition cannot contain the task they just tapped.
                if (savedStateHandle.get<String>(KEY_FILTER) == null &&
                    aiTaskRepo.unreadCount() > 0
                ) {
                    savedStateHandle[KEY_FILTER] = Filter.DISMISSED.name
                }
                aiTaskRepo.acknowledgeAll()
            }.onFailure {
                _loadFailed.value = true
                errorReporter.captureException(it as? Exception ?: Exception(it))
            }
            _isLoading.value = false
        }
    }

    /** Suspends so pull-to-refresh keeps its spinner up until the pull actually ends. */
    suspend fun refresh() {
        runCatching {
            aiTaskRepo.refresh()
            aiTaskRepo.acknowledgeAll()
        }.onFailure {
            _loadFailed.value = true
            errorReporter.captureException(it as? Exception ?: Exception(it))
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
     * Logs a Claude proposal. [itemIds] null accepts every item. A failure keeps the card
     * and the caller's selection so the user can retry; a 409 means the proposal is gone
     * and the repository has already refreshed the list.
     */
    fun acceptProposal(
        taskId: String,
        itemIds: List<String>?,
    ) {
        if (_busyTaskId.value != null) return
        _busyTaskId.value = taskId
        viewModelScope.launch {
            try {
                aiTaskRepo.acceptProposal(taskId, itemIds)
                _messages.emit(R.string.ai_tasks_proposal_logged)
                refreshManager.refreshAll()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (e is ApiException && (e.statusCode == 409 || e.statusCode == 404)) {
                    _messages.emit(R.string.ai_tasks_proposal_accept_conflict)
                } else {
                    errorReporter.captureException(e)
                    _messages.emit(R.string.ai_tasks_proposal_accept_failed)
                }
            } finally {
                _busyTaskId.value = null
            }
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
                errorReporter.captureException(e)
                _messages.emit(R.string.ai_task_save_failed)
            } finally {
                _busyTaskId.value = null
            }
        }
    }

    private companion object {
        const val KEY_FILTER = "ai_tasks_filter"
    }
}
