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
    private val pageSize = 20

    /**
     * False for pickers whose result must already be one of the user's own foods
     * (merge keeper, package mapping): an Open Food Facts hit would create a food.
     */
    var openFoodFactsFallback = true

    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    private val search = FoodSearch(viewModelScope, foodRepo, errorReporter) { _snackbarMessage.value = it }
    val query: StateFlow<String> = search.query
    val searchResults: StateFlow<List<Food>> = search.results
    val isSearching: StateFlow<Boolean> = search.isSearching
    val offResults: StateFlow<List<OpenFoodFactsProduct>> = search.offResults
    val isSearchingOff: StateFlow<Boolean> = search.isSearchingOff
    val isResolvingOff: StateFlow<Boolean> = search.isResolvingOff

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

    /**
     * Fetches page 1 and swaps it in on success, so the list the user is looking at
     * (and its scroll position) stays put while the fetch runs.
     */
    private fun refreshAllFoods() {
        paginationJob?.cancel()
        _isLoadingMore.value = true
        paginationJob =
            viewModelScope.launch {
                try {
                    val page = foodRepo.fetchFoodsPage(pageSize, 0, cacheOnly = false)
                    allFoodsFromCache = page.fromCache
                    _allFoods.value = page.foods.distinctBy { it.id }
                    allFoodsOffset = page.foods.size
                    _canLoadMore.value = allFoodsOffset < page.total
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                    _snackbarMessage.value = UiMessage(R.string.food_search_load_failed)
                }
                _isLoadingMore.value = false
            }
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

    fun updateQuery(newQuery: String) = search.update(newQuery, openFoodFacts = openFoodFactsFallback)

    /** Back to an empty search on the All tab, for a picker sheet reopened on a kept instance. */
    fun resetSearch() {
        search.reset()
        _selectedTab.value = TAB_ALL
        loadAllFoods()
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
        if (index == TAB_ALL && _allFoods.value.isEmpty() && !_isLoadingMore.value) loadAllFoods()
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
                search.updateResults { it.withFavorite(food.id, isFavorite) }
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

    fun selectOffProduct(
        product: OpenFoodFactsProduct,
        onResolved: (Food) -> Unit,
    ) = search.selectOffProduct(product, onResolved)

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
        refreshAllFoods()
    }

    companion object {
        const val TAB_ALL = 0
        const val TAB_RECENT = 1
        const val TAB_FAVORITES = 2
    }
}
