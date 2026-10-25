package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.analytics.ActivityAdjustedGoals
import com.bissbilanz.analytics.adjustGoalsForActivity
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.DayPropertiesField
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
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

    private val skeleton = FirstLoadSkeleton(viewModelScope)
    val isLoading: StateFlow<Boolean> = skeleton.isLoading

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

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

    private val _activityCaloriesSource = MutableStateFlow<DayProperties.ActivityCaloriesSource?>(null)
    val activityCaloriesSource: StateFlow<DayProperties.ActivityCaloriesSource?> = _activityCaloriesSource.asStateFlow()

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
                    entryRepo.entriesByDate(date).onEach(skeleton::onEntries)
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

    /**
     * Today's goals raised by a share of the day's workout calories, when the user
     * opted in under Settings. Falls back to the unadjusted goals (zero bonus) while
     * disabled or before either goals or prefs have loaded.
     */
    val adjustedGoals: StateFlow<ActivityAdjustedGoals?> =
        combine(goals, activityCalories, prefs) { currentGoals, calories, currentPrefs ->
            adjustGoalsForActivity(
                currentGoals,
                calories,
                enabled = currentPrefs?.activityGoalAdjustment ?: false,
                creditPercent = currentPrefs?.activityCreditPercent ?: 100,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private var loadJob: Job? = null

    /** A pull-to-refresh in flight; a plain [loadData] for the same day leaves it running. */
    private var refreshJob: Job? = null

    /** Bumped by every local day-property edit, so a slower server answer can't revert it. */
    private var dayPropertiesEdits = 0

    /**
     * The day the day-property flows currently hold, or null while the selected day's
     * values are still loading. Relative edits (+250 ml) wait for it so they never add
     * onto another day's value.
     */
    private var dayPropertiesDate: String? = null

    init {
        rollOverToToday()
        loadData()
    }

    fun previousDay() {
        setSelectedDate(LocalDate.parse(selectedDateString.value).minus(1, DateTimeUnit.DAY))
        loadData()
    }

    fun nextDay() {
        val next = LocalDate.parse(selectedDateString.value).plus(1, DateTimeUnit.DAY)
        if (next > today()) return
        setSelectedDate(next)
        loadData()
    }

    fun goToToday() {
        setSelectedDate(today())
        loadData()
    }

    /**
     * Called on resume and at midnight while visible: a dashboard left on "today"
     * follows the calendar to the new today, so it never shows (and logs to) yesterday
     * the next morning. A day the user picked deliberately stays selected.
     */
    fun rollOverToToday() {
        val today = today().toString()
        val previousToday = savedStateHandle.get<String>(KEY_TODAY) ?: today
        savedStateHandle[KEY_TODAY] = today
        if (previousToday != today && selectedDateString.value == previousToday) {
            setSelectedDate(LocalDate.parse(today))
            loadData()
        }
    }

    private fun today(): LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault())

    private fun setSelectedDate(date: LocalDate) {
        val dateStr = date.toString()
        if (dateStr == selectedDateString.value) return
        savedStateHandle[KEY_SELECTED_DATE] = dateStr
        loadJob?.cancel()
        refreshJob?.cancel()
        dayPropertiesDate = null
        applyDayProperties(null)
    }

    fun loadData() {
        val dateStr = selectedDateString.value
        currentDateString.value = dateStr
        // The refresh reloads this day anyway; cancelling it would end the pull indicator early.
        if (refreshJob?.isActive == true) return
        loadJob?.cancel()
        loadJob = viewModelScope.launch { loadDay(dateStr) }
    }

    /** Pull-to-refresh: suspends until everything is refreshed, so the indicator tracks the work. */
    suspend fun refreshAll() {
        val dateStr = selectedDateString.value
        currentDateString.value = dateStr
        loadJob?.cancel()
        refreshJob?.cancel()
        val job =
            viewModelScope.launch {
                coroutineScope {
                    launch {
                        try {
                            refreshManager.refreshAll(dateStr)
                        } catch (e: Exception) {
                            if (e is CancellationException) throw e
                            errorReporter.captureException(e)
                        }
                    }
                    loadDay(dateStr)
                }
            }
        refreshJob = job
        job.join()
    }

    private suspend fun loadDay(date: String) {
        coroutineScope {
            // Independent of the entries refresh: the repository falls back to the
            // cached day when the network is down.
            launch { loadDayProperties(date) }
            launch {
                try {
                    goalsRepo.refresh()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    errorReporter.captureException(e)
                }
            }
            val failed =
                try {
                    entryRepo.refresh(date)
                    false
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    errorReporter.captureException(e)
                    true
                }
            if (date == selectedDateString.value) {
                _refreshFailed.value = failed
                skeleton.onLoadFinished()
            }
        }
    }

    /**
     * The cached values go on screen at once, so taps and drafts work offline and never
     * start from an empty card; the server copy replaces them only if nothing was edited
     * in the meantime.
     */
    private suspend fun loadDayProperties(date: String) {
        if (dayPropertiesDate != date) {
            val cached =
                try {
                    entryRepo.cachedDayPropertiesOnce(date)
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    errorReporter.captureException(e)
                    null
                }
            if (date != selectedDateString.value) return
            applyDayProperties(cached)
            dayPropertiesDate = date
        }
        val editsBefore = dayPropertiesEdits
        val props =
            try {
                entryRepo.getDayProperties(date)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                return
            }
        if (date != selectedDateString.value || dayPropertiesEdits != editsBefore) return
        applyDayProperties(props)
    }

    private fun applyDayProperties(props: DayProperties?) {
        _isFastingDay.value = props?.isFastingDay ?: false
        _notes.value = props?.notes ?: ""
        _waterMl.value = props?.waterMl
        _activityCalories.value = props?.activityCalories
        _activityCaloriesSource.value = props?.activityCaloriesSource
        _activityNote.value = props?.activityNote
    }

    fun toggleFastingDay() {
        val date = selectedDateString.value
        if (dayPropertiesDate != date) return
        val newValue = !_isFastingDay.value
        dayPropertiesEdits++
        _isFastingDay.value = newValue
        viewModelScope.launch {
            try {
                entryRepo.setDayProperties(date, isFastingDay = newValue)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                if (date == selectedDateString.value) _isFastingDay.value = !newValue
                _snackbarMessage.value = UiMessage(R.string.dashboard_fasting_update_failed)
            }
        }
    }

    /** [deltaMl] may be negative; the result is clamped to `0..MAX_WATER_ML`. */
    fun addWater(deltaMl: Int) {
        // Until the selected day's value has loaded there is nothing to add onto.
        if (dayPropertiesDate != selectedDateString.value) return
        setWater(((_waterMl.value ?: 0) + deltaMl).coerceIn(0, MAX_WATER_ML))
    }

    /**
     * [date] is the day the edit was made on. The cards pass the day they were showing,
     * so a draft saved while switching days lands on its own day; only an edit to the
     * selected day updates what is on screen.
     */
    fun setWater(
        valueMl: Int?,
        date: String = selectedDateString.value,
    ) {
        val clamped = valueMl?.coerceIn(0, MAX_WATER_ML)
        dayPropertiesEdits++
        if (date == selectedDateString.value) _waterMl.value = clamped
        viewModelScope.launch {
            try {
                if (clamped == null) {
                    entryRepo.setDayProperties(date, cleared = setOf(DayPropertiesField.WATER_ML))
                } else {
                    entryRepo.setDayProperties(date, waterMl = clamped)
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.dashboard_water_update_failed)
            }
        }
    }

    fun clearWater() = setWater(null)

    fun setActivity(
        calories: Int?,
        note: String?,
        date: String = selectedDateString.value,
    ) {
        val clampedCalories = calories?.coerceIn(0, MAX_ACTIVITY_CALORIES)
        val trimmedNote = note?.trim()?.takeIf { it.isNotEmpty() }
        dayPropertiesEdits++
        if (date == selectedDateString.value) {
            _activityCalories.value = clampedCalories
            // Mirrors EntryRepository's default: a manual edit that sets a value takes
            // "manual" as its source, and clearing the value clears the source too.
            _activityCaloriesSource.value =
                if (clampedCalories != null) DayProperties.ActivityCaloriesSource.manual else null
            _activityNote.value = trimmedNote
        }
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
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.dashboard_activity_update_failed)
            }
        }
    }

    fun clearActivity() = setActivity(null, null)

    fun setNotes(
        text: String,
        date: String = selectedDateString.value,
    ) {
        dayPropertiesEdits++
        if (date == selectedDateString.value) _notes.value = text
        viewModelScope.launch {
            try {
                val trimmed = text.trim()
                if (trimmed.isEmpty()) {
                    entryRepo.setDayProperties(date, cleared = setOf(DayPropertiesField.NOTES))
                } else {
                    entryRepo.setDayProperties(date, notes = trimmed)
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.dashboard_notes_update_failed)
            }
        }
    }

    fun copyEntriesFromYesterday() {
        val today = LocalDate.parse(selectedDateString.value)
        viewModelScope.launch {
            try {
                val yesterday = today.minus(1, DateTimeUnit.DAY).toString()
                val count = entryRepo.copyEntries(yesterday, today.toString())
                if (count == 0) {
                    _snackbarMessage.value = UiMessage(R.string.dashboard_copy_failed)
                } else {
                    _snackbarMessage.value = UiMessage(R.string.dashboard_copied_count, listOf(count))
                }
                if (today.toString() == selectedDateString.value) loadData()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.dashboard_copy_error)
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        private const val KEY_SELECTED_DATE = "selectedDate"
        private const val KEY_TODAY = "todayAtLastCheck"
    }
}
