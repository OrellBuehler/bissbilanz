package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.HealthSyncService
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealType
import com.bissbilanz.model.MealTypeCreate
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

class SettingsViewModel(
    private val authManager: AuthManager,
    private val goalsRepo: GoalsRepository,
    private val prefsRepo: PreferencesRepository,
    private val api: BissbilanzApi,
    private val healthSync: HealthSyncService,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val prefs: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private val _customMealTypes = MutableStateFlow<List<MealType>>(emptyList())
    val customMealTypes: StateFlow<List<MealType>> = _customMealTypes.asStateFlow()

    private val _healthAvailable = MutableStateFlow(false)
    val healthAvailable: StateFlow<Boolean> = _healthAvailable.asStateFlow()

    private val _healthPermGranted = MutableStateFlow(false)
    val healthPermGranted: StateFlow<Boolean> = _healthPermGranted.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            goalsRepo.refresh()
            prefsRepo.refresh()
            try {
                val response = api.getMealTypes()
                _customMealTypes.value = response.mealTypes
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
            _healthAvailable.value = healthSync.isAvailable()
            if (_healthAvailable.value) {
                _healthPermGranted.value = healthSync.hasPermissions()
            }
        }
    }

    fun refreshAll() {
        viewModelScope.launch {
            refreshManager.refreshAll()
        }
    }

    fun refreshHealthPermissions() {
        viewModelScope.launch {
            _healthPermGranted.value = healthSync.hasPermissions()
        }
    }

    fun setGoals(goals: Goals) {
        viewModelScope.launch {
            try {
                goalsRepo.setGoals(goals)
                _snackbarMessage.value = "Goals updated"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update goals"
            }
        }
    }

    fun updatePreference(update: PreferencesUpdate) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(update)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update preference"
            }
        }
    }

    fun updateFavoriteMealAssignmentMode(mode: GenPreferencesUpdate.FavoriteMealAssignmentMode) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(favoriteMealAssignmentMode = mode))
                _snackbarMessage.value = "Meal assignment updated"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update preference"
            }
        }
    }

    fun updateVisibleNutrients(nutrients: List<String>) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(visibleNutrients = nutrients))
                _snackbarMessage.value = "Visible nutrients updated"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to update nutrients"
            }
        }
    }

    fun addMealType(name: String) {
        viewModelScope.launch {
            try {
                api.createMealType(MealTypeCreate(name = name, sortOrder = _customMealTypes.value.size))
                val response = api.getMealTypes()
                _customMealTypes.value = response.mealTypes
                _snackbarMessage.value = "Meal type added"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to add meal type"
            }
        }
    }

    fun logout() {
        authManager.logout()
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
