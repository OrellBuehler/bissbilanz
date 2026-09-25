package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.ReminderCreate
import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.MealType
import com.bissbilanz.model.Reminder
import com.bissbilanz.model.Supplement
import com.bissbilanz.repository.ReminderRepository
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RemindersViewModel(
    private val reminderRepo: ReminderRepository,
    private val supplementRepo: SupplementRepository,
    private val api: BissbilanzApi,
    private val appModeManager: AppModeManager,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val reminders: StateFlow<List<Reminder>> =
        reminderRepo
            .reminders()
            .map { list -> list.sortedBy { it.time } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Active supplements that have at least one reminder time — read-only in this screen. */
    val supplementReminders: StateFlow<List<Supplement>> =
        supplementRepo
            .supplements()
            .map { list -> list.filter { it.isActive && !it.reminderTimes.isNullOrEmpty() } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _customMealTypes = MutableStateFlow<List<MealType>>(emptyList())
    val customMealTypes: StateFlow<List<MealType>> = _customMealTypes.asStateFlow()

    private val _snackbarMessageRes = MutableStateFlow<Int?>(null)
    val snackbarMessageRes: StateFlow<Int?> = _snackbarMessageRes.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            reminderRepo.refresh()
            supplementRepo.refresh()
            // Custom meal types are server-only; Local mode only offers the four defaults.
            if (!appModeManager.isLocal) {
                try {
                    _customMealTypes.value = api.getMealTypes().mealTypes
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                }
            }
        }
    }

    fun createReminder(reminder: ReminderCreate) {
        viewModelScope.launch {
            try {
                reminderRepo.createReminder(reminder)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.reminders_save_failed
            }
        }
    }

    fun updateReminder(
        id: String,
        reminder: ReminderUpdate,
    ) {
        viewModelScope.launch {
            try {
                reminderRepo.updateReminder(id, reminder)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.reminders_save_failed
            }
        }
    }

    fun deleteReminder(id: String) {
        viewModelScope.launch {
            try {
                reminderRepo.deleteReminder(id)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.reminders_delete_failed
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessageRes.value = null
    }
}
