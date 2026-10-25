package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AddFoodViewModel(
    private val foodRepo: FoodRepository,
    private val recipeRepo: RecipeRepository,
    private val entryRepo: EntryRepository,
    private val prefsRepo: PreferencesRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val recentFoods: StateFlow<List<Food>> = foodRepo.recentFoods

    val visibleNutrients: StateFlow<Set<String>?> =
        prefsRepo
            .preferences()
            .map { it?.visibleNutrients?.toSet() }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val favoriteFoods: StateFlow<List<Food>> =
        foodRepo.favorites().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allRecipes: StateFlow<List<Recipe>> =
        recipeRepo.allRecipes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val favoriteRecipes: StateFlow<List<Recipe>> =
        allRecipes
            .map { list -> list.filter { it.isFavorite } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    suspend fun searchRecipes(query: String): List<Recipe> = recipeRepo.searchRecipes(query)

    fun cachedRecipe(id: String): Recipe? = recipeRepo.getRecipeCached(id)

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Food>>(emptyList())
    val searchResults: StateFlow<List<Food>> = _searchResults.asStateFlow()

    private val _recipeResults = MutableStateFlow<List<Recipe>>(emptyList())
    val recipeResults: StateFlow<List<Recipe>> = _recipeResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _offResults = MutableStateFlow<List<OpenFoodFactsProduct>>(emptyList())
    val offResults: StateFlow<List<OpenFoodFactsProduct>> = _offResults.asStateFlow()

    private val _isSearchingOff = MutableStateFlow(false)
    val isSearchingOff: StateFlow<Boolean> = _isSearchingOff.asStateFlow()

    private val _isResolvingOff = MutableStateFlow(false)
    val isResolvingOff: StateFlow<Boolean> = _isResolvingOff.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<FoodSnackbar?>(null)
    val snackbarMessage: StateFlow<FoodSnackbar?> = _snackbarMessage.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            try {
                foodRepo.refreshRecentFoods()
                foodRepo.refreshFavorites()
                recipeRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    fun reset() {
        _query.value = ""
        _searchResults.value = emptyList()
        _recipeResults.value = emptyList()
        _offResults.value = emptyList()
        _isSearching.value = false
        _isSearchingOff.value = false
        searchJob?.cancel()
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
                            _snackbarMessage.value = FoodSnackbar(R.string.food_search_failed)
                            emptyList()
                        }
                    _searchResults.value = results
                    _recipeResults.value =
                        try {
                            recipeRepo.searchRecipes(newQuery)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            errorReporter.captureException(e)
                            emptyList()
                        }
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
                    _isSearching.value = false
                    _searchResults.value = emptyList()
                    _recipeResults.value = emptyList()
                    _offResults.value = emptyList()
                }
            }
    }

    fun logFood(
        food: Food,
        mealType: String,
        servings: Double,
        date: String,
        eatenAt: String? = null,
        onComplete: () -> Unit,
    ) {
        _isSaving.value = true
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(foodId = food.id, mealType = mealType, servings = servings, date = date, eatenAt = eatenAt),
                    food = food,
                )
                _snackbarMessage.value = FoodSnackbar(R.string.food_detail_logged, food.name)
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = FoodSnackbar(R.string.food_detail_log_failed)
            } finally {
                _isSaving.value = false
            }
        }
    }

    fun logRecipe(
        recipe: Recipe,
        mealType: String,
        servings: Double,
        date: String,
        eatenAt: String? = null,
        onComplete: () -> Unit,
    ) {
        _isSaving.value = true
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(recipeId = recipe.id, mealType = mealType, servings = servings, date = date, eatenAt = eatenAt),
                    recipe = recipe,
                )
                _snackbarMessage.value = FoodSnackbar(R.string.food_detail_logged, recipe.name)
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = FoodSnackbar(R.string.recipe_list_log_failed)
            } finally {
                _isSaving.value = false
            }
        }
    }

    fun logQuickEntry(
        mealType: String,
        date: String,
        name: String,
        calories: Double?,
        protein: Double?,
        carbs: Double?,
        fat: Double?,
        fiber: Double?,
        quickNutrients: Map<String, Double>?,
        notes: String?,
        onComplete: () -> Unit,
    ) {
        _isSaving.value = true
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(
                        mealType = mealType,
                        servings = 1.0,
                        date = date,
                        quickName = name.trim().ifBlank { null },
                        quickCalories = calories,
                        quickProtein = protein,
                        quickCarbs = carbs,
                        quickFat = fat,
                        quickFiber = fiber,
                        quickNutrients = quickNutrients,
                        notes = notes?.ifBlank { null },
                    ),
                )
                _snackbarMessage.value = FoodSnackbar(R.string.food_detail_logged, name)
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = FoodSnackbar(R.string.add_food_quick_log_failed)
            } finally {
                _isSaving.value = false
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
                    _snackbarMessage.value = FoodSnackbar(R.string.food_search_off_add_failed)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = FoodSnackbar(R.string.food_search_off_add_failed)
            } finally {
                _isResolvingOff.value = false
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    private companion object {
        const val OFF_FALLBACK_THRESHOLD = 5
    }
}
