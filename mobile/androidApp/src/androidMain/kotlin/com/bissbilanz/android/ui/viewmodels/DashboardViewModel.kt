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
import com.bissbilanz.util.DayPropertiesField
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
import kotlin.time.Clock

/** Server clamp for water/activity calories (see `day-properties.ts`). */
const val MAX_WATER_ML = 20000
const val MAX_ACTIVITY_CALORIES = 20000
const val DEFAULT_WATER_GOAL_ML = 2000

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

    private val _isFastingDay = MutableStateFlow(false)
    val isFastingDay: StateFlow<Boolean> = _isFastingDay.asStateFlow()

    private val _notes = MutableStateFlow("")
    val notes: StateFlow<String> = _notes.asStateFlow()

    private val _waterMl = MutableStateFlow<Int?>(null)
    val waterMl: StateFlow<Int?> = _waterMl.asStateFlow()

    private val _activityCalories = MutableStateFlow<Int?>(null)
    val activityCalories: StateFlow<Int?> = _activityCalories.asStateFlow()

    private val _activityNote = MutableStateFlow<String?>(null)
    val activityNote: StateFlow<String?> = _activityNote.asStateFlow()

    val waterGoalMl: StateFlow<Int> =
        prefsRepo
            .preferences()
            .map { it?.waterGoalMl ?: DEFAULT_WATER_GOAL_ML }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DEFAULT_WATER_GOAL_ML)

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
        val next = LocalDate.parse(selectedDateString.value).plus(1, DateTimeUnit.DAY)
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
                loadDayProperties(dateStr)
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
            loadDayProperties(selectedDateString.value)
        }
    }

    private suspend fun loadDayProperties(date: String) {
        try {
            val props = entryRepo.getDayProperties(date)
            _isFastingDay.value = props?.isFastingDay ?: false
            _notes.value = props?.notes ?: ""
            _waterMl.value = props?.waterMl
            _activityCalories.value = props?.activityCalories
            _activityNote.value = props?.activityNote
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            _isFastingDay.value = false
            _notes.value = ""
            _waterMl.value = null
            _activityCalories.value = null
            _activityNote.value = null
        }
    }

    fun toggleFastingDay() {
        val date = selectedDateString.value
        val newValue = !_isFastingDay.value
        _isFastingDay.value = newValue
        viewModelScope.launch {
            try {
                entryRepo.setDayProperties(date, isFastingDay = newValue)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _isFastingDay.value = !newValue
                _snackbarMessage.value = "Failed to update fasting day"
            }
        }
    }

    /** [deltaMl] may be negative; the result is clamped to `0..MAX_WATER_ML`. */
    fun addWater(deltaMl: Int) {
        setWater(((_waterMl.value ?: 0) + deltaMl).coerceIn(0, MAX_WATER_ML))
    }

    fun setWater(valueMl: Int?) {
        val date = selectedDateString.value
        val clamped = valueMl?.coerceIn(0, MAX_WATER_ML)
        _waterMl.value = clamped
        viewModelScope.launch {
            try {
                if (clamped == null) {
                    entryRepo.setDayProperties(date, cleared = setOf(DayPropertiesField.WATER_ML))
                } else {
                    entryRepo.setDayProperties(date, waterMl = clamped)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update water"
            }
        }
    }

    fun clearWater() = setWater(null)

    fun setActivity(
        calories: Int?,
        note: String?,
    ) {
        val date = selectedDateString.value
        val clampedCalories = calories?.coerceIn(0, MAX_ACTIVITY_CALORIES)
        val trimmedNote = note?.trim()?.takeIf { it.isNotEmpty() }
        _activityCalories.value = clampedCalories
        _activityNote.value = trimmedNote
        viewModelScope.launch {
            try {
                val cleared =
                    buildSet {
                        if (clampedCalories == null) add(DayPropertiesField.ACTIVITY_CALORIES)
                        if (trimmedNote == null) add(DayPropertiesField.ACTIVITY_NOTE)
                    }
                entryRepo.setDayProperties(
                    date,
                    activityCalories = clampedCalories,
                    activityNote = trimmedNote,
                    cleared = cleared,
                )
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update activity"
            }
        }
    }

    fun clearActivity() = setActivity(null, null)

    fun setNotes(text: String) {
        val date = selectedDateString.value
        _notes.value = text
        viewModelScope.launch {
            try {
                val trimmed = text.trim()
                if (trimmed.isEmpty()) {
                    entryRepo.setDayProperties(date, cleared = setOf(DayPropertiesField.NOTES))
                } else {
                    entryRepo.setDayProperties(date, notes = trimmed)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update notes"
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
