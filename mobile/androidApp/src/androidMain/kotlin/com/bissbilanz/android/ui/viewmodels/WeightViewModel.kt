package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.model.Goals
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightTrendEntry
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class WeightViewModel(
    private val weightRepo: WeightRepository,
    private val goalsRepo: GoalsRepository,
    private val errorReporter: ErrorReporter,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val _trendData = MutableStateFlow<List<WeightTrendEntry>>(emptyList())
    val trendData: StateFlow<List<WeightTrendEntry>> = _trendData.asStateFlow()

    val entries: StateFlow<List<WeightEntry>> =
        weightRepo
            .entries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    /** Preserves every other goal field; only the target changes. */
    fun setTarget(
        targetWeightKg: Double?,
        targetDate: String?,
    ) {
        viewModelScope.launch {
            try {
                val current = goals.value ?: return@launch
                goalsRepo.setGoals(current.copy(targetWeightKg = targetWeightKg, targetDate = targetDate))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.weight_target_update_failed)
            }
        }
    }

    // Backed by SavedStateHandle so range/projection survive process death.
    val selectedRange: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_SELECTED_RANGE, 1) // default 30d

    val projectionDays: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_PROJECTION_DAYS, 0)

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    private var loadJob: Job? = null
    private var hasLoaded = false

    init {
        loadTrend(fromServer = true)
    }

    fun selectRange(index: Int) {
        savedStateHandle[KEY_SELECTED_RANGE] = index
        loadTrend(fromServer = false)
    }

    fun setProjectionDays(days: Int) {
        savedStateHandle[KEY_PROJECTION_DAYS] = days
    }

    /** Pull-to-refresh: pulls weight and goals from the server, then redraws the trend. */
    suspend fun refresh() {
        loadTrend(fromServer = true).join()
    }

    /** After a local log, edit or delete — the local cache already holds the change. */
    fun refreshTrend() {
        loadTrend(fromServer = false)
    }

    private fun rangeStartDate(): kotlinx.datetime.LocalDate {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        return when (selectedRange.value) {
            0 -> today.minus(7, DateTimeUnit.DAY)
            1 -> today.minus(30, DateTimeUnit.DAY)
            2 -> today.minus(90, DateTimeUnit.DAY)
            else -> kotlinx.datetime.LocalDate(2000, 1, 1)
        }
    }

    private suspend fun applyTrend() {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        _trendData.value = weightRepo.getTrend(rangeStartDate().toString(), today.toString())
    }

    // A newer load cancels the previous one so an older, slower response cannot overwrite
    // the newer range. The full-screen spinner only covers the very first load; afterwards
    // the current chart stays up. Only a server refresh (first load, pull-to-refresh)
    // reports a network failure — a range switch falls back to the cache quietly.
    private fun loadTrend(fromServer: Boolean): Job {
        loadJob?.cancel()
        return viewModelScope
            .launch {
                if (!hasLoaded) {
                    _isLoading.value = true
                    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
                    _trendData.value = weightRepo.localTrend(rangeStartDate().toString(), today.toString())
                }
                if (fromServer) {
                    try {
                        weightRepo.refresh()
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        _snackbarMessage.value = UiMessage(R.string.weight_load_failed)
                    }
                    try {
                        goalsRepo.refresh()
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                    }
                }
                try {
                    applyTrend()
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                }
                hasLoaded = true
                _isLoading.value = false
            }.also { loadJob = it }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        private const val KEY_SELECTED_RANGE = "selectedRange"
        private const val KEY_PROJECTION_DAYS = "projectionDays"
    }
}
