package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class FoodSearchViewModel(
    private val foodRepo: FoodRepository,
    private val entryRepo: EntryRepository,
    private val errorReporter: ErrorReporter,
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
    private var searchJob: Job? = null
    private val pageSize = 20

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Food>>(emptyList())
    val searchResults: StateFlow<List<Food>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _offResults = MutableStateFlow<List<OpenFoodFactsProduct>>(emptyList())
    val offResults: StateFlow<List<OpenFoodFactsProduct>> = _offResults.asStateFlow()

    private val _isSearchingOff = MutableStateFlow(false)
    val isSearchingOff: StateFlow<Boolean> = _isSearchingOff.asStateFlow()

    private val _isResolvingOff = MutableStateFlow(false)
    val isResolvingOff: StateFlow<Boolean> = _isResolvingOff.asStateFlow()

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
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to load recent foods"
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
            errorReporter.captureException(e)
            _snackbarMessage.value = "Failed to load foods"
        }
        _isLoadingMore.value = false
    }

    fun updateQuery(newQuery: String) {
        _query.value = newQuery
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                if (newQuery.length >= 2) {
                    delay(300)
                    _isSearching.value = true
                    _offResults.value = emptyList()
                    val results =
                        try {
                            foodRepo.searchFoods(newQuery)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            errorReporter.captureException(e)
                            _snackbarMessage.value = "Search failed"
                            emptyList()
                        }
                    _searchResults.value = results
                    _isSearching.value = false
                    // Mirrors the web FoodPicker: only fall back to Open Food Facts
                    // when the user's own database has few matches.
                    if (results.size < OFF_FALLBACK_THRESHOLD) {
                        _isSearchingOff.value = true
                        try {
                            _offResults.value = foodRepo.searchOpenFoodFacts(newQuery)
                        } finally {
                            _isSearchingOff.value = false
                        }
                    }
                } else {
                    _searchResults.value = emptyList()
                    _offResults.value = emptyList()
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
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to log food"
            }
        }
    }

    fun toggleFavorite(food: Food) {
        viewModelScope.launch {
            try {
                foodRepo.toggleFavorite(food.id, !food.isFavorite)
                refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    /**
     * Copy-on-use: an Open Food Facts hit becomes a food in the user's database
     * (or resolves to the one already carrying that barcode) before it can be
     * logged or opened.
     */
    fun selectOffProduct(
        product: OpenFoodFactsProduct,
        onResolved: (Food) -> Unit,
    ) {
        if (_isResolvingOff.value) return
        _isResolvingOff.value = true
        viewModelScope.launch {
            try {
                val food = foodRepo.findOrCreateByBarcode(product.barcode)
                if (food != null) {
                    onResolved(food)
                } else {
                    _snackbarMessage.value = "Couldn't add from Open Food Facts"
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Couldn't add from Open Food Facts"
            } finally {
                _isResolvingOff.value = false
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
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to refresh"
            }
        }
        if (_selectedTab.value == 1) loadAllFoods()
    }

    private companion object {
        const val OFF_FALLBACK_THRESHOLD = 5
    }
}
