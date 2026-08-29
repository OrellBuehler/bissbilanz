package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
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
import kotlinx.coroutines.flow.map
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
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    // Backed by SavedStateHandle so the selected day survives process death.
    private val selectedDateString =
        savedStateHandle.getStateFlow(
            KEY_SELECTED_DATE,
            Clock.System.todayIn(TimeZone.currentSystemDefault()).toString(),
        )
    val selectedDate: StateFlow<LocalDate> =
        selectedDateString
            .map(LocalDate::parse)
            .stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                LocalDate.parse(selectedDateString.value),
            )

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    /**
     * True when the last entries refresh failed. The dashboard uses it to tell a
     * swallowed network error apart from a genuinely empty day, which would
     * otherwise both render as "no entries yet".
     */
    private val _refreshFailed = MutableStateFlow(false)
    val refreshFailed: StateFlow<Boolean> = _refreshFailed.asStateFlow()

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
        setSelectedDate(LocalDate.parse(selectedDateString.value).minus(1, DateTimeUnit.DAY))
        loadData()
    }

    fun nextDay() {
        // Future days hold nothing to show and can't be logged to, so stop at
        // today — same rule as the iOS dashboard.
        val next = LocalDate.parse(selectedDateString.value).plus(1, DateTimeUnit.DAY)
        if (next > Clock.System.todayIn(TimeZone.currentSystemDefault())) return
        setSelectedDate(next)
        loadData()
    }

    fun goToToday() {
        setSelectedDate(Clock.System.todayIn(TimeZone.currentSystemDefault()))
        loadData()
    }

    private fun setSelectedDate(date: LocalDate) {
        savedStateHandle[KEY_SELECTED_DATE] = date.toString()
    }

    fun loadData(loadFailedMessage: String? = null) {
        val dateStr = selectedDateString.value
        currentDateString.value = dateStr
        viewModelScope.launch {
            _isLoading.value = true
            try {
                entryRepo.refresh(dateStr)
                goalsRepo.refresh()
                _refreshFailed.value = false
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _refreshFailed.value = true
                loadFailedMessage?.let { _snackbarMessage.value = it }
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun refreshAll() {
        viewModelScope.launch {
            try {
                refreshManager.refreshAll(selectedDateString.value)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    fun copyEntriesFromYesterday(
        copiedMessage: (Int) -> String,
        failedMessage: String,
    ) {
        viewModelScope.launch {
            try {
                val today = LocalDate.parse(selectedDateString.value)
                val yesterday = today.minus(1, DateTimeUnit.DAY).toString()
                val count = entryRepo.copyEntries(yesterday, today.toString())
                _snackbarMessage.value = copiedMessage(count)
                loadData()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = failedMessage
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        private const val KEY_SELECTED_DATE = "selectedDate"
    }
}
