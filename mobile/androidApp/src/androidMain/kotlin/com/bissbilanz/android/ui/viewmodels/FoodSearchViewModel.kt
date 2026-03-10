package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class FoodSearchViewModel(
    private val foodRepo: FoodRepository,
    private val entryRepo: EntryRepository,
) : ViewModel() {
    val recentFoods: StateFlow<List<Food>> = foodRepo.recentFoods
    val favorites: StateFlow<List<Food>> = foodRepo.favorites

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Food>>(emptyList())
    val searchResults: StateFlow<List<Food>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init {
        viewModelScope.launch {
            foodRepo.loadRecentFoods()
            foodRepo.loadFavorites()
        }
    }

    fun updateQuery(newQuery: String) {
        _query.value = newQuery
        viewModelScope.launch {
            if (newQuery.length >= 2) {
                _isSearching.value = true
                _searchResults.value =
                    try {
                        foodRepo.searchFoods(newQuery)
                    } catch (_: Exception) {
                        emptyList()
                    }
                _isSearching.value = false
            } else {
                _searchResults.value = emptyList()
            }
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    fun logFood(
        food: Food,
        meal: String,
        servings: Double,
    ) {
        viewModelScope.launch {
            try {
                val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                entryRepo.createEntry(
                    EntryCreate(foodId = food.id, mealType = meal, servings = servings, date = today),
                )
                _snackbarMessage.value = "Logged ${food.name}"
            } catch (e: Exception) {
                _snackbarMessage.value = "Failed to log food"
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
