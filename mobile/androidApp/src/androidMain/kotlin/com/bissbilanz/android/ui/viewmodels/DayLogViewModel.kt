package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
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
) : ViewModel() {
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

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
            } catch (e: Exception) {
                _error.value = "Failed to load entries"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteEntry(id: String) {
        viewModelScope.launch {
            try {
                entryRepo.deleteEntry(id)
            } catch (e: Exception) {
                _error.value = "Failed to delete entry"
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}
