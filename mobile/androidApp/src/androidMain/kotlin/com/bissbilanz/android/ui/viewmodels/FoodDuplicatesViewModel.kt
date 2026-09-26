package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.FoodDuplicateGroup
import com.bissbilanz.repository.FoodMergeUnavailableException
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FoodDuplicatesViewModel(
    private val foodRepo: FoodRepository,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
    appModeManager: AppModeManager,
) : ViewModel() {
    /**
     * Duplicate detection is a server-side scan over the whole food set — same
     * reasoning as [com.bissbilanz.android.ui.viewmodels.InsightsViewModel]'s
     * `isLocalMode`. Shown as an explicit message rather than hiding the screen, since
     * it is reachable from a bottom-tab top bar that has to keep working either way.
     */
    val isLocalMode: Boolean = appModeManager.isLocal

    private val _groups = MutableStateFlow<List<FoodDuplicateGroup>>(emptyList())
    val groups: StateFlow<List<FoodDuplicateGroup>> = _groups.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isMerging = MutableStateFlow(false)
    val isMerging: StateFlow<Boolean> = _isMerging.asStateFlow()

    private val _snackbarMessageRes = MutableStateFlow<Int?>(null)
    val snackbarMessageRes: StateFlow<Int?> = _snackbarMessageRes.asStateFlow()

    init {
        load()
    }

    fun load() {
        if (isLocalMode) {
            _isLoading.value = false
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _groups.value = foodRepo.fetchDuplicateGroups()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.food_duplicates_load_failed
            }
            _isLoading.value = false
        }
    }

    /**
     * Merges every other food in [group] into [keeperId], then refreshes the list
     * (the resolved group drops out) and — like every other food-affecting action —
     * the wider caches so any entry or recipe that pointed at a merged-away source
     * shows the keeper instead.
     */
    fun merge(
        group: FoodDuplicateGroup,
        keeperId: String,
    ) {
        val sourceIds = group.foods.map { it.id }.filterNot { it == keeperId }
        if (sourceIds.isEmpty()) return
        viewModelScope.launch {
            _isMerging.value = true
            try {
                foodRepo.mergeFoods(keeperId = keeperId, sourceIds = sourceIds)
                refreshManager.refreshAll()
                _snackbarMessageRes.value = R.string.food_merge_success
                load()
            } catch (e: FoodMergeUnavailableException) {
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.food_merge_unavailable_offline
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessageRes.value = R.string.food_merge_failed
            }
            _isMerging.value = false
        }
    }

    fun clearSnackbar() {
        _snackbarMessageRes.value = null
    }
}
