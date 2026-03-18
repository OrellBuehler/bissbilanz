package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightTrendEntry
import com.bissbilanz.repository.WeightRepository
import io.sentry.Sentry
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
) : ViewModel() {
    private val _trendData = MutableStateFlow<List<WeightTrendEntry>>(emptyList())
    val trendData: StateFlow<List<WeightTrendEntry>> = _trendData.asStateFlow()

    val entries: StateFlow<List<WeightEntry>> =
        weightRepo
            .entries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _selectedRange = MutableStateFlow(1) // default 30d
    val selectedRange: StateFlow<Int> = _selectedRange.asStateFlow()

    private val _projectionDays = MutableStateFlow(0)
    val projectionDays: StateFlow<Int> = _projectionDays.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadTrend()
    }

    fun selectRange(index: Int) {
        _selectedRange.value = index
        loadTrend()
    }

    fun setProjectionDays(days: Int) {
        _projectionDays.value = days
    }

    fun refresh() {
        loadTrend()
    }

    fun refreshTrend() {
        viewModelScope.launch {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val from =
                when (_selectedRange.value) {
                    0 -> today.minus(7, DateTimeUnit.DAY)
                    1 -> today.minus(30, DateTimeUnit.DAY)
                    2 -> today.minus(90, DateTimeUnit.DAY)
                    else -> kotlinx.datetime.LocalDate(2000, 1, 1)
                }
            try {
                _trendData.value = weightRepo.getTrend(from.toString(), today.toString())
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
            }
        }
    }

    private fun loadTrend() {
        viewModelScope.launch {
            _isLoading.value = true
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val from =
                when (_selectedRange.value) {
                    0 -> today.minus(7, DateTimeUnit.DAY)
                    1 -> today.minus(30, DateTimeUnit.DAY)
                    2 -> today.minus(90, DateTimeUnit.DAY)
                    else -> kotlinx.datetime.LocalDate(2000, 1, 1)
                }
            try {
                val trend = weightRepo.getTrend(from.toString(), today.toString())
                _trendData.value = trend
                weightRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
            } finally {
                _isLoading.value = false
            }
        }
    }
}
