package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.FoodPackageEvents
import com.bissbilanz.android.ui.components.MealLogDetails
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class FoodSearchViewModel(
    private val foodRepo: FoodRepository,
    private val entryRepo: EntryRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val recentFoods: StateFlow<List<Food>> = foodRepo.recentFoods

    val favoriteFoods: StateFlow<List<Food>> =
        foodRepo
            .favorites()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _allFoods = MutableStateFlow<List<Food>>(emptyList())
    val allFoods: StateFlow<List<Food>> = _allFoods.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _canLoadMore = MutableStateFlow(true)
    val canLoadMore: StateFlow<Boolean> = _canLoadMore.asStateFlow()

    private var allFoodsOffset = 0
    private var allFoodsFromCache = false
    private val togglingFavoriteIds = mutableSetOf<String>()
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

    /**
     * False for pickers whose result must already be one of the user's own foods
     * (merge keeper, package mapping): an Open Food Facts hit would create a food.
     */
    var openFoodFactsFallback = true

    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    init {
        loadAllFoods()
        // An imported food package changes the list this screen already holds.
        viewModelScope.launch { FoodPackageEvents.imported.collect { refresh() } }
        viewModelScope.launch {
            try {
                foodRepo.refreshRecentFoods()
                foodRepo.refreshFavorites()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_search_load_recent_failed)
            }
        }
    }

    fun loadAllFoods() {
        paginationJob?.cancel()
        allFoodsFromCache = false
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
            var page = foodRepo.fetchFoodsPage(pageSize, allFoodsOffset, cacheOnly = allFoodsFromCache)
            if (page.fromCache && !allFoodsFromCache) {
                // The server became unreachable mid-list: start over from the device's
                // copy rather than append its pages to the server's (they need not line up).
                allFoodsFromCache = true
                if (allFoodsOffset > 0) {
                    allFoodsOffset = 0
                    _allFoods.value = emptyList()
                    page = foodRepo.fetchFoodsPage(pageSize, 0, cacheOnly = true)
                }
            }
            // Offset paging over a name-sorted list repeats a food when one is added or
            // renamed between pages; the list is keyed by id, so drop the repeat.
            _allFoods.value = (_allFoods.value + page.foods).distinctBy { it.id }
            allFoodsOffset += page.foods.size
            _canLoadMore.value = allFoodsOffset < page.total
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            _snackbarMessage.value = UiMessage(R.string.food_search_load_failed)
        }
        _isLoadingMore.value = false
    }

    fun updateQuery(newQuery: String) {
        _query.value = newQuery
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                if (newQuery.length >= 2) {
                    // Searching from the first keystroke, so the debounce never shows
                    // the previous query's "no results".
                    _isSearching.value = true
                    _offResults.value = emptyList()
                    delay(300)
                    val results =
                        try {
                            foodRepo.searchFoods(newQuery)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            errorReporter.captureException(e)
                            _snackbarMessage.value = UiMessage(R.string.food_search_failed)
                            emptyList()
                        }
                    _searchResults.value = results
                    _isSearching.value = false
                    // Mirrors the web FoodPicker: only fall back to Open Food Facts
                    // when the user's own database has few matches.
                    if (openFoodFactsFallback && results.size < OFF_FALLBACK_THRESHOLD) {
                        _isSearchingOff.value = true
                        try {
                            _offResults.value = foodRepo.searchOpenFoodFacts(newQuery)
                        } finally {
                            _isSearchingOff.value = false
                        }
                    }
                } else {
                    _isSearching.value = false
                    _searchResults.value = emptyList()
                    _offResults.value = emptyList()
                }
            }
    }

    /** Back to an empty search on the All tab, for a picker sheet reopened on a kept instance. */
    fun resetSearch() {
        searchJob?.cancel()
        _query.value = ""
        _searchResults.value = emptyList()
        _offResults.value = emptyList()
        _isSearching.value = false
        _isSearchingOff.value = false
        _selectedTab.value = TAB_ALL
        loadAllFoods()
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
        if (index == TAB_ALL) loadAllFoods()
    }

    fun logFood(
        food: Food,
        details: MealLogDetails,
    ) {
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(
                        foodId = food.id,
                        mealType = details.mealType,
                        servings = details.servings,
                        date = details.date,
                        eatenAt = details.eatenAt,
                        notes = details.notes,
                    ),
                    food = food,
                )
                _snackbarMessage.value = UiMessage(R.string.food_detail_logged, listOf(food.name))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_detail_log_failed)
            }
        }
    }

    fun toggleFavorite(food: Food) {
        // A second tap before the first lands would toggle from the same stale row.
        if (!togglingFavoriteIds.add(food.id)) return
        val isFavorite = !food.isFavorite
        viewModelScope.launch {
            try {
                foodRepo.toggleFavorite(food.id, isFavorite)
                // In place rather than reloading: a reload would scroll the All tab
                // back to the top, and a stale row would make the next toggle a no-op.
                // The repository updates its recents itself.
                _allFoods.value = _allFoods.value.withFavorite(food.id, isFavorite)
                _searchResults.value = _searchResults.value.withFavorite(food.id, isFavorite)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_search_favorite_failed)
            } finally {
                togglingFavoriteIds.remove(food.id)
            }
        }
    }

    private fun List<Food>.withFavorite(
        id: String,
        isFavorite: Boolean,
    ): List<Food> = map { if (it.id == id) it.copy(isFavorite = isFavorite) else it }

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
                    _snackbarMessage.value = UiMessage(R.string.food_search_off_add_failed)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_search_off_add_failed)
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
                foodRepo.refreshFavorites()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_search_refresh_failed)
            }
        }
        if (_selectedTab.value == TAB_ALL) loadAllFoods()
    }

    companion object {
        const val TAB_ALL = 0
        const val TAB_RECENT = 1
        const val TAB_FAVORITES = 2
        private const val OFF_FALLBACK_THRESHOLD = 5
    }
}
