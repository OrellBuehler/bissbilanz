package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightTrendEntry
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn

class WeightViewModel(
    private val weightRepo: WeightRepository,
    private val errorReporter: ErrorReporter,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val _trendData = MutableStateFlow<List<WeightTrendEntry>>(emptyList())
    val trendData: StateFlow<List<WeightTrendEntry>> = _trendData.asStateFlow()

    val entries: StateFlow<List<WeightEntry>> =
        weightRepo
            .entries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Backed by SavedStateHandle so range/projection survive process death.
    val selectedRange: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_SELECTED_RANGE, 1) // default 30d

    val projectionDays: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_PROJECTION_DAYS, 0)

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init {
        loadTrend()
    }

    fun selectRange(index: Int) {
        savedStateHandle[KEY_SELECTED_RANGE] = index
        loadTrend()
    }

    fun setProjectionDays(days: Int) {
        savedStateHandle[KEY_PROJECTION_DAYS] = days
    }

    fun refresh() {
        loadTrend()
    }

    fun refreshTrend() {
        viewModelScope.launch {
            try {
                applyTrend()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
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

    private fun loadTrend() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                weightRepo.refresh()
                applyTrend()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to load weight data"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        private const val KEY_SELECTED_RANGE = "selectedRange"
        private const val KEY_PROJECTION_DAYS = "projectionDays"
    }
}
