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
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalCoroutinesApi::class)
class DayLogViewModel(
    private val entryRepo: EntryRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private val firstLoadDone = MutableStateFlow(false)

    /** The first list the entries query emitted, or null before it has. */
    private val firstEntries = MutableStateFlow<List<Entry>?>(null)

    /**
     * Only the first load shows the skeleton: until cached entries are on screen, or until
     * the first refresh finished for a day that is really empty, so "no entries" never
     * flashes before the network answered.
     */
    val isLoading: StateFlow<Boolean> =
        combine(firstLoadDone, firstEntries) { done, first ->
            first == null || (first.isEmpty() && !done)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, true)

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    /** Entries swiped away whose delete still waits out the undo snackbar. */
    private val _pendingDeleteIds = MutableStateFlow<Set<String>>(emptySet())
    val pendingDeleteIds: StateFlow<Set<String>> = _pendingDeleteIds.asStateFlow()
    private val pendingDeleteJobs = mutableMapOf<String, Job>()

    /** Swiped entries by id, kept until their snackbar has decided, so a late undo can restore one. */
    private val swipedEntries = mutableMapOf<String, Entry>()

    /** Pending ids whose delete has already started; onCleared must not run them again. */
    private val committingIds = mutableSetOf<String>()

    private val currentDateFlow = MutableStateFlow("")

    val entries: StateFlow<List<Entry>> =
        currentDateFlow
            .flatMapLatest { date ->
                if (date.isNotEmpty()) {
                    entryRepo.entriesByDate(date).onEach { if (firstEntries.value == null) firstEntries.value = it }
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
            _snackbarMessage.value = null
            try {
                entryRepo.refresh(date)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.daylog_load_failed)
            } finally {
                firstLoadDone.value = true
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
                _snackbarMessage.value = UiMessage(R.string.daylog_delete_failed)
            }
        }
    }

    /**
     * Hides [entry] now and deletes it once the undo snackbar is dismissed ([commitDelete]).
     * Held here rather than in the screen so rotating or leaving during the snackbar
     * still deletes: the timer is a fallback for a snackbar that never reports back.
     */
    fun scheduleDelete(entry: Entry) {
        val id = entry.id
        if (id in _pendingDeleteIds.value) return
        swipedEntries[id] = entry
        _pendingDeleteIds.update { it + id }
        pendingDeleteJobs[id] =
            viewModelScope.launch {
                delay(UNDO_FALLBACK_MS)
                deleteNow(id)
            }
    }

    /**
     * A queued snackbar can still offer Undo after the fallback timer already deleted the
     * entry; it is then logged again rather than leaving a button that does nothing.
     */
    fun undoDelete(id: String) {
        val entry = swipedEntries.remove(id)
        if (id in _pendingDeleteIds.value) {
            pendingDeleteJobs.remove(id)?.cancel()
            _pendingDeleteIds.update { it - id }
            return
        }
        entry ?: return
        viewModelScope.launch {
            try {
                entryRepo.restoreEntry(entry)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.daylog_restore_failed)
            }
        }
    }

    fun commitDelete(id: String) {
        swipedEntries.remove(id)
        deleteNow(id)
    }

    private fun deleteNow(id: String) {
        if (id !in _pendingDeleteIds.value) return
        if (!committingIds.add(id)) return
        pendingDeleteJobs.remove(id)?.cancel()
        viewModelScope.launch {
            try {
                // Leaving the screen mid-delete must not cut it in half.
                withContext(NonCancellable) { entryRepo.deleteEntry(id) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.daylog_delete_failed)
            } finally {
                _pendingDeleteIds.update { it - id }
                committingIds.remove(id)
            }
        }
    }

    override fun onCleared() {
        // viewModelScope is already cancelled here; the deletes the user confirmed by
        // leaving must not be dropped with it.
        val ids = _pendingDeleteIds.value - committingIds
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

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        /** Longer than a short snackbar, so a visible snackbar always decides first. */
        const val UNDO_FALLBACK_MS = 10_000L
    }
}
