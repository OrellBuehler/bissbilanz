package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AiTasksViewModel(
    private val aiTaskRepo: AiTaskRepository,
    private val errorReporter: ErrorReporter,
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

    private companion object {
        const val KEY_FILTER = "ai_tasks_filter"
    }
}
