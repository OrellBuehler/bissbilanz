package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class DayLogViewModel(
    private val entryRepo: EntryRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    /** True only until the first load finishes; later refreshes keep the list on screen. */
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<Int?>(null)
    val error: StateFlow<Int?> = _error.asStateFlow()

    /** Entries swiped away whose delete still waits out the undo snackbar. */
    private val _pendingDeleteIds = MutableStateFlow<Set<String>>(emptySet())
    val pendingDeleteIds: StateFlow<Set<String>> = _pendingDeleteIds.asStateFlow()
    private val pendingDeleteJobs = mutableMapOf<String, Job>()

    private val currentDateFlow = MutableStateFlow("")

    val entries: StateFlow<List<Entry>> =
        currentDateFlow
            .flatMapLatest { date ->
                if (date.isNotEmpty()) {
                    entryRepo.entriesByDate(date)
                } else {
                    flowOf(emptyList())
                }
            }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * The day's entries minus those waiting out the undo snackbar. A pending id may be a
     * temp id whose upload has since swapped it for the server one, so both are hidden.
     */
    val visibleEntries: StateFlow<List<Entry>> =
        combine(entries, _pendingDeleteIds) { list, pending ->
            if (pending.isEmpty()) {
                list
            } else {
                val hidden = pending + pending.map { entryRepo.resolveId(it) }
                list.filter { it.id !in hidden }
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var currentDate: String? = null

    fun loadEntries(
        date: String,
        force: Boolean = false,
    ) {
        if (date == currentDate && !force) return
        currentDate = date
        currentDateFlow.value = date
        viewModelScope.launch {
            _error.value = null
            if (_isLoading.value && entryRepo.entriesByDateOnce(date).isNotEmpty()) _isLoading.value = false
            try {
                entryRepo.refresh(date)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _error.value = R.string.daylog_load_failed
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteEntry(id: String) {
        viewModelScope.launch {
            try {
                entryRepo.deleteEntry(id)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _error.value = R.string.daylog_delete_failed
            }
        }
    }

    /**
     * Hides [id] now and deletes it once the undo snackbar is dismissed ([commitDelete]).
     * Held here rather than in the screen so rotating or leaving during the snackbar
     * still deletes: the timer is a fallback for a snackbar that never reports back.
     */
    fun scheduleDelete(id: String) {
        if (id in _pendingDeleteIds.value) return
        _pendingDeleteIds.update { it + id }
        pendingDeleteJobs[id] =
            viewModelScope.launch {
                delay(UNDO_FALLBACK_MS)
                commitDelete(id)
            }
    }

    fun undoDelete(id: String) {
        pendingDeleteJobs.remove(id)?.cancel()
        _pendingDeleteIds.update { it - id }
    }

    fun commitDelete(id: String) {
        if (id !in _pendingDeleteIds.value) return
        pendingDeleteJobs.remove(id)?.cancel()
        viewModelScope.launch {
            try {
                entryRepo.deleteEntry(id)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _error.value = R.string.daylog_delete_failed
            } finally {
                _pendingDeleteIds.update { it - id }
            }
        }
    }

    override fun onCleared() {
        // viewModelScope is already cancelled here; the deletes the user confirmed by
        // leaving must not be dropped with it.
        val ids = _pendingDeleteIds.value
        if (ids.isEmpty()) return
        CoroutineScope(Dispatchers.IO + NonCancellable).launch {
            for (id in ids) {
                try {
                    entryRepo.deleteEntry(id)
                } catch (e: Exception) {
                    errorReporter.captureException(e)
                }
            }
        }
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): Int? =
        try {
            entryRepo.copyEntries(fromDate, toDate)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    fun clearError() {
        _error.value = null
    }

    companion object {
        /** Longer than a short snackbar, so a visible snackbar always decides first. */
        const val UNDO_FALLBACK_MS = 10_000L
    }
}
