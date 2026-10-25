package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.model.Food
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The debounced search over the user's foods with its Open Food Facts fallback, and the
 * copy-on-use of an Open Food Facts hit, shared by the food pickers' view models.
 */
internal class FoodSearch(
    private val scope: CoroutineScope,
    private val foodRepo: FoodRepository,
    private val errorReporter: ErrorReporter,
    private val showMessage: (UiMessage) -> Unit,
) {
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _results = MutableStateFlow<List<Food>>(emptyList())
    val results: StateFlow<List<Food>> = _results.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _offResults = MutableStateFlow<List<OpenFoodFactsProduct>>(emptyList())
    val offResults: StateFlow<List<OpenFoodFactsProduct>> = _offResults.asStateFlow()

    private val _isSearchingOff = MutableStateFlow(false)
    val isSearchingOff: StateFlow<Boolean> = _isSearchingOff.asStateFlow()

    private val _isResolvingOff = MutableStateFlow(false)
    val isResolvingOff: StateFlow<Boolean> = _isResolvingOff.asStateFlow()

    private var searchJob: Job? = null

    /**
     * [alsoSearch] runs after the food search, before the spinner stops; [clear] runs
     * for a query too short to search, so the caller can empty what [alsoSearch] filled.
     */
    fun update(
        newQuery: String,
        openFoodFacts: Boolean = true,
        alsoSearch: suspend (String) -> Unit = {},
        clear: () -> Unit = {},
    ) {
        _query.value = newQuery
        searchJob?.cancel()
        searchJob =
            scope.launch {
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
                            showMessage(UiMessage(R.string.food_search_failed))
                            emptyList()
                        }
                    _results.value = results
                    alsoSearch(newQuery)
                    _isSearching.value = false
                    // Mirrors the web FoodPicker: only fall back to Open Food Facts
                    // when the user's own database has few matches.
                    if (openFoodFacts && results.size < OFF_FALLBACK_THRESHOLD) {
                        _isSearchingOff.value = true
                        try {
                            _offResults.value = foodRepo.searchOpenFoodFacts(newQuery)
                        } finally {
                            _isSearchingOff.value = false
                        }
                    }
                } else {
                    _isSearching.value = false
                    _results.value = emptyList()
                    clear()
                    _offResults.value = emptyList()
                }
            }
    }

    fun reset() {
        searchJob?.cancel()
        _query.value = ""
        _results.value = emptyList()
        _offResults.value = emptyList()
        _isSearching.value = false
        _isSearchingOff.value = false
    }

    fun updateResults(transform: (List<Food>) -> List<Food>) {
        _results.value = transform(_results.value)
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
        scope.launch {
            try {
                val food = foodRepo.findOrCreateByBarcode(product.barcode)
                if (food != null) {
                    onResolved(food)
                } else {
                    showMessage(UiMessage(R.string.food_search_off_add_failed))
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                showMessage(UiMessage(R.string.food_search_off_add_failed))
            } finally {
                _isResolvingOff.value = false
            }
        }
    }

    private companion object {
        const val OFF_FALLBACK_THRESHOLD = 5
    }
}
