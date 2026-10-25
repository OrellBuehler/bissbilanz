package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.AccountDowngradeController
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.ClaudeCapability
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.cache.LocalDataWiper
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealType
import com.bissbilanz.model.MealTypeCreate
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.util.PreferencesField
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
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
    private val localDataWiper: LocalDataWiper,
    private val syncManager: SyncManager,
    private val downgradeController: AccountDowngradeController,
) : ViewModel() {
    val mode: StateFlow<AppMode?> = appModeManager.mode

    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val prefs: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val claudeCapability: StateFlow<ClaudeCapability?> = prefsRepo.claudeCapability

    private val _customMealTypes = MutableStateFlow<List<MealType>>(emptyList())
    val customMealTypes: StateFlow<List<MealType>> = _customMealTypes.asStateFlow()

    /**
     * Localized snackbar messages, as string resource ids the screen resolves — a
     * ViewModel has no Context, and the app-language override only reaches an activity
     * context below API 33, so resolving here would leak the system locale.
     */
    private val _snackbarMessageRes = MutableStateFlow<Int?>(null)
    val snackbarMessageRes: StateFlow<Int?> = _snackbarMessageRes.asStateFlow()

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            // Offline or a dead session: keep showing the cached goals and preferences.
            refreshCatching { goalsRepo.refresh() }
            refreshCatching { prefsRepo.refresh() }
            // Custom meal types are server-only; the management UI is hidden in Local mode.
            if (!appModeManager.isLocal) {
                try {
                    val response = api.getMealTypes()
                    _customMealTypes.value = response.mealTypes
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                }
            }
        }
    }

    private suspend fun refreshCatching(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun refreshAll() {
        refreshManager.refreshAll()
    }

    fun setGoals(goals: Goals) {
        viewModelScope.launch {
            try {
                goalsRepo.setGoals(goals)
                _snackbarMessageRes.value = R.string.settings_goals_updated
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_goals_update_failed
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
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateFavoriteMealAssignmentMode(mode: GenPreferencesUpdate.FavoriteMealAssignmentMode) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(favoriteMealAssignmentMode = mode))
                _snackbarMessageRes.value = R.string.settings_meal_assignment_updated
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    /**
     * A `null` [value] is the "Not set" option. It is announced as an explicit clear so
     * it survives the wire and the local cache — `PreferencesUpdate` encodes both
     * "unchanged" and "cleared" as null, and the shared Json omits nulls.
     */
    fun updateBiologicalSex(value: GenPreferencesUpdate.BiologicalSex?) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(
                    PreferencesUpdate(biologicalSex = value),
                    cleared = if (value == null) setOf(PreferencesField.BIOLOGICAL_SEX) else emptySet(),
                )
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateWaterGoal(ml: Int) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(waterGoalMl = ml))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateActivityGoalAdjustment(enabled: Boolean) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(activityGoalAdjustment = enabled))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateActivityCreditPercent(percent: Int) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(activityCreditPercent = percent.coerceIn(0, 100)))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateAiTaskProcessor(value: GenPreferencesUpdate.AiTaskProcessor) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(aiTaskProcessor = value))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateAiTaskAutoLog(enabled: Boolean) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(aiTaskAutoLog = enabled))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_preference_update_failed
            }
        }
    }

    fun updateVisibleNutrients(nutrients: List<String>) {
        viewModelScope.launch {
            try {
                prefsRepo.updatePreferences(PreferencesUpdate(visibleNutrients = nutrients))
                _snackbarMessageRes.value = R.string.settings_nutrients_updated
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_nutrients_update_failed
            }
        }
    }

    fun addMealType(name: String) {
        viewModelScope.launch {
            try {
                api.createMealType(MealTypeCreate(name = name, sortOrder = _customMealTypes.value.size))
                val response = api.getMealTypes()
                _customMealTypes.value = response.mealTypes
                _snackbarMessageRes.value = R.string.settings_meal_type_added
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_meal_type_add_failed
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            // Deliberate logout: wipe the local store, sync queue and sync markers
            // BEFORE flipping the auth state. Leftover rows would leak into the next
            // account that signs in on this device (or be re-uploaded as "local data").
            try {
                syncManager.withSyncPaused { localDataWiper.wipeAll() }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                prefsRepo.clearClaudeCapability()
            }
            authManager.logout()
            // Reset the mode so the next start shows the login screen with the mode choice again.
            appModeManager.clear()
        }
    }

    private val _exportingData = MutableStateFlow(false)
    val exportingData: StateFlow<Boolean> = _exportingData.asStateFlow()

    private val _exportedFile = MutableStateFlow<java.io.File?>(null)
    val exportedFile: StateFlow<java.io.File?> = _exportedFile.asStateFlow()

    fun exportData(cacheDir: java.io.File) {
        if (_exportingData.value) return
        viewModelScope.launch {
            _exportingData.value = true
            try {
                val bytes = api.exportAccountData()
                val file =
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        val dir = java.io.File(cacheDir, "exports").apply { mkdirs() }
                        val date =
                            java.time.LocalDate
                                .now()
                                .toString()
                        java.io.File(dir, "bissbilanz-export-$date.zip").apply { writeBytes(bytes) }
                    }
                _exportedFile.value = file
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_export_failed
            } finally {
                _exportingData.value = false
            }
        }
    }

    fun clearExportedFile() {
        _exportedFile.value = null
    }

    // Owned by the application-scoped controller: the downgrade must outlive
    // this screen, and its state must too.
    val downgradeState: StateFlow<AccountDowngradeController.State> = downgradeController.state

    fun downgradeToLocal() = downgradeController.start()

    fun resetDowngrade() = downgradeController.reset()

    fun deleteAccount() {
        viewModelScope.launch {
            try {
                api.deleteAccount()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.settings_delete_account_failed
                return@launch
            }
            // Same teardown as logout: wipe local data before flipping auth state.
            try {
                syncManager.withSyncPaused { localDataWiper.wipeAll() }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                prefsRepo.clearClaudeCapability()
            }
            authManager.logout()
            appModeManager.clear()
        }
    }

    fun clearSnackbarRes() {
        _snackbarMessageRes.value = null
    }
}
