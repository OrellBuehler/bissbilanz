package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.health.HealthExporter
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.repository.SleepRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class SleepViewModel(
    private val sleepRepo: SleepRepository,
    private val healthExporter: HealthExporter,
    private val errorReporter: ErrorReporter,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    /** Newest first — the history list and the "last night" card both read from the top. */
    val entries: StateFlow<List<SleepEntry>> =
        sleepRepo
            .entries()
            .map { list -> list.sortedByDescending { it.entryDate } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val selectedRange: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_SELECTED_RANGE, 1) // default 30d

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init {
        refresh()
    }

    fun selectRange(index: Int) {
        savedStateHandle[KEY_SELECTED_RANGE] = index
    }

    /** Entries inside the selected range, oldest first — chart input. */
    fun chartEntries(all: List<SleepEntry>): List<SleepEntry> {
        val start = rangeStartDate().toString()
        return all.filter { it.entryDate >= start }.sortedBy { it.entryDate }
    }

    fun refresh() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                sleepRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun createEntry(
        entry: SleepCreate,
        successMessage: String,
        failureMessage: String,
    ) {
        viewModelScope.launch {
            try {
                sleepRepo.createEntry(entry)
                healthExporter.exportLatestSleep()
                _snackbarMessage.value = successMessage
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = failureMessage
            }
        }
    }

    fun updateEntry(
        id: String,
        entry: SleepUpdate,
        successMessage: String,
        failureMessage: String,
    ) {
        viewModelScope.launch {
            try {
                sleepRepo.updateEntry(id, entry)
                healthExporter.exportLatestSleep()
                _snackbarMessage.value = successMessage
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = failureMessage
            }
        }
    }

    fun deleteEntry(
        id: String,
        successMessage: String,
        failureMessage: String,
    ) {
        viewModelScope.launch {
            try {
                sleepRepo.deleteEntry(id)
                _snackbarMessage.value = successMessage
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = failureMessage
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    private fun rangeStartDate(): LocalDate {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        return when (selectedRange.value) {
            0 -> today.minus(7, DateTimeUnit.DAY)
            1 -> today.minus(30, DateTimeUnit.DAY)
            2 -> today.minus(90, DateTimeUnit.DAY)
            else -> LocalDate(2000, 1, 1)
        }
    }

    companion object {
        private const val KEY_SELECTED_RANGE = "selectedRange"
    }
}
