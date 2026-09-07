package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
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

/** Server clamp for water/activity calories (see `day-properties.ts`). */
const val MAX_WATER_ML = 20000
const val MAX_ACTIVITY_CALORIES = 20000
const val DEFAULT_WATER_GOAL_ML = 2000

@OptIn(ExperimentalCoroutinesApi::class)
class DayLogViewModel(
    private val entryRepo: EntryRepository,
    private val errorReporter: ErrorReporter,
    prefsRepo: PreferencesRepository,
) : ViewModel() {
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

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

    private var currentDate: String? = null

    fun loadEntries(
        date: String,
        force: Boolean = false,
    ) {
        if (date == currentDate && !force) return
        currentDate = date
        currentDateFlow.value = date
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                entryRepo.refresh(date)
                loadDayProperties(date)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _error.value = "Failed to load entries"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun refreshFastingDay(date: String) {
        viewModelScope.launch { loadDayProperties(date) }
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

    fun toggleFastingDay(date: String) {
        val newValue = !_isFastingDay.value
        _isFastingDay.value = newValue
        viewModelScope.launch {
            try {
                entryRepo.setDayProperties(date, isFastingDay = newValue)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _isFastingDay.value = !newValue
                _error.value = "Failed to update fasting day"
            }
        }
    }

    /** [deltaMl] may be negative; the result is clamped to `0..MAX_WATER_ML`. */
    fun addWater(
        date: String,
        deltaMl: Int,
    ) {
        setWater(date, ((_waterMl.value ?: 0) + deltaMl).coerceIn(0, MAX_WATER_ML))
    }

    fun setWater(
        date: String,
        valueMl: Int?,
    ) {
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
                _error.value = "Failed to update water"
            }
        }
    }

    fun clearWater(date: String) = setWater(date, null)

    fun setActivity(
        date: String,
        calories: Int?,
        note: String?,
    ) {
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
                _error.value = "Failed to update activity"
            }
        }
    }

    fun clearActivity(date: String) = setActivity(date, null, null)

    fun setNotes(
        date: String,
        text: String,
    ) {
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
                _error.value = "Failed to update notes"
            }
        }
    }

    fun deleteEntry(id: String) {
        viewModelScope.launch {
            try {
                entryRepo.deleteEntry(id)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _error.value = "Failed to delete entry"
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}
