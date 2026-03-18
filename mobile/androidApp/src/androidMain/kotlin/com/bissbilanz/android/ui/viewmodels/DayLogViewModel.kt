package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import io.sentry.Sentry
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class DayLogViewModel(
    private val entryRepo: EntryRepository,
    private val api: BissbilanzApi,
) : ViewModel() {
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isFastingDay = MutableStateFlow(false)
    val isFastingDay: StateFlow<Boolean> = _isFastingDay.asStateFlow()

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
                loadFastingDay(date)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
                _error.value = "Failed to load entries"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun refreshFastingDay(date: String) {
        viewModelScope.launch { loadFastingDay(date) }
    }

    private suspend fun loadFastingDay(date: String) {
        try {
            val props = api.getDayProperties(date)
            _isFastingDay.value = props?.isFastingDay ?: false
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Sentry.captureException(e)
            _isFastingDay.value = false
        }
    }

    fun toggleFastingDay(date: String) {
        val newValue = !_isFastingDay.value
        _isFastingDay.value = newValue
        viewModelScope.launch {
            try {
                if (newValue) {
                    api.setDayProperties(date, isFastingDay = true)
                } else {
                    api.deleteDayProperties(date)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
                _isFastingDay.value = !newValue
                _error.value = "Failed to update fasting day"
            }
        }
    }

    fun deleteEntry(id: String) {
        viewModelScope.launch {
            try {
                entryRepo.deleteEntry(id)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
                _error.value = "Failed to delete entry"
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}
