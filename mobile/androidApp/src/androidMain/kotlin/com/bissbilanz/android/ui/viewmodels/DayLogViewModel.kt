package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DayLogViewModel(
    private val entryRepo: EntryRepository,
) : ViewModel() {
    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val entries: StateFlow<List<Entry>> = entryRepo.entries

    private var currentDate: String? = null

    fun loadEntries(date: String) {
        if (date == currentDate) return
        currentDate = date
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                entryRepo.loadEntries(date)
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
