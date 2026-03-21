package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.*

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModel(
    private val entryRepo: EntryRepository,
    private val goalsRepo: GoalsRepository,
    private val prefsRepo: PreferencesRepository,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private val _selectedDate = MutableStateFlow(Clock.System.todayIn(TimeZone.currentSystemDefault()))
    val selectedDate: StateFlow<LocalDate> = _selectedDate.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    private val currentDateString = MutableStateFlow("")

    val entries: StateFlow<List<Entry>> =
        currentDateString
            .flatMapLatest { date ->
                if (date.isNotEmpty()) {
                    entryRepo.entriesByDate(date)
                } else {
                    flowOf(emptyList())
                }
            }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val prefs: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    init {
        loadData()
    }

    fun previousDay() {
        _selectedDate.value = _selectedDate.value.minus(1, DateTimeUnit.DAY)
        loadData()
    }

    fun nextDay() {
        _selectedDate.value = _selectedDate.value.plus(1, DateTimeUnit.DAY)
        loadData()
    }

    fun goToToday() {
        _selectedDate.value = Clock.System.todayIn(TimeZone.currentSystemDefault())
        loadData()
    }

    fun loadData() {
        val dateStr = _selectedDate.value.toString()
        currentDateString.value = dateStr
        viewModelScope.launch {
            _isLoading.value = true
            try {
                entryRepo.refresh(dateStr)
                goalsRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to load data"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun refreshAll() {
        viewModelScope.launch {
            try {
                refreshManager.refreshAll(_selectedDate.value.toString())
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    fun copyEntriesFromYesterday() {
        viewModelScope.launch {
            try {
                val yesterday = _selectedDate.value.minus(1, DateTimeUnit.DAY).toString()
                val count = entryRepo.copyEntries(yesterday, _selectedDate.value.toString())
                _snackbarMessage.value = "Copied $count entries from yesterday"
                loadData()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "No entries to copy from yesterday"
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
