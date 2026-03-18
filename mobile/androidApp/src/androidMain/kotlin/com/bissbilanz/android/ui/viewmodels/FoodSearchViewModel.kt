package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import io.sentry.Sentry
import kotlinx.coroutines.Job
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

    private val _allFoods = MutableStateFlow<List<Food>>(emptyList())
    val allFoods: StateFlow<List<Food>> = _allFoods.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _canLoadMore = MutableStateFlow(true)
    val canLoadMore: StateFlow<Boolean> = _canLoadMore.asStateFlow()

    private var allFoodsOffset = 0
    private var paginationJob: Job? = null
    private val pageSize = 20

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
            try {
                foodRepo.refreshRecentFoods()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
            }
        }
    }

    fun loadAllFoods() {
        paginationJob?.cancel()
        allFoodsOffset = 0
        _allFoods.value = emptyList()
        _canLoadMore.value = true
        _isLoadingMore.value = true
        paginationJob = viewModelScope.launch { fetchNextPage() }
    }

    fun loadMoreFoods() {
        if (_isLoadingMore.value || !_canLoadMore.value) return
        _isLoadingMore.value = true
        paginationJob = viewModelScope.launch { fetchNextPage() }
    }

    private suspend fun fetchNextPage() {
        try {
            val response = foodRepo.fetchFoodsPaginated(pageSize, allFoodsOffset)
            _allFoods.value = _allFoods.value + response.foods
            allFoodsOffset += response.foods.size
            _canLoadMore.value = allFoodsOffset < response.total
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Sentry.captureException(e)
        }
        _isLoadingMore.value = false
    }

    fun updateQuery(newQuery: String) {
        _query.value = newQuery
        viewModelScope.launch {
            if (newQuery.length >= 2) {
                _isSearching.value = true
                _searchResults.value =
                    try {
                        foodRepo.searchFoods(newQuery)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        Sentry.captureException(e)
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
        if (index == 1) loadAllFoods()
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
                    food = food,
                )
                _snackbarMessage.value = "Logged ${food.name}"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
                _snackbarMessage.value = "Failed to log food"
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                foodRepo.refreshRecentFoods()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
            }
        }
        if (_selectedTab.value == 1) loadAllFoods()
    }
}
