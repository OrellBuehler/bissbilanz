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

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    private val search = FoodSearch(viewModelScope, foodRepo, errorReporter) { _snackbarMessage.value = it }
    val query: StateFlow<String> = search.query
    val searchResults: StateFlow<List<Food>> = search.results
    val isSearching: StateFlow<Boolean> = search.isSearching
    val offResults: StateFlow<List<OpenFoodFactsProduct>> = search.offResults
    val isSearchingOff: StateFlow<Boolean> = search.isSearchingOff
    val isResolvingOff: StateFlow<Boolean> = search.isResolvingOff

    private val _recipeResults = MutableStateFlow<List<Recipe>>(emptyList())
    val recipeResults: StateFlow<List<Recipe>> = _recipeResults.asStateFlow()

    init {
        viewModelScope.launch {
            refreshQuietly { foodRepo.refreshRecentFoods() }
            refreshQuietly { foodRepo.refreshFavorites() }
            refreshQuietly { recipeRepo.refresh() }
        }
    }

    private suspend fun refreshQuietly(refresh: suspend () -> Unit) {
        try {
            refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    fun reset() {
        search.reset()
        _recipeResults.value = emptyList()
    }

    fun updateQuery(newQuery: String) =
        search.update(
            newQuery,
            alsoSearch = { query ->
                _recipeResults.value =
                    try {
                        recipeRepo.searchRecipes(query)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        emptyList()
                    }
            },
            clear = { _recipeResults.value = emptyList() },
        )

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
                _snackbarMessage.value = UiMessage(R.string.food_detail_logged, listOf(food.name))
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.food_detail_log_failed)
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
                _snackbarMessage.value = UiMessage(R.string.food_detail_logged, listOf(recipe.name))
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.recipe_list_log_failed)
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
                _snackbarMessage.value = UiMessage(R.string.food_detail_logged, listOf(name))
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.add_food_quick_log_failed)
            } finally {
                _isSaving.value = false
            }
        }
    }

    fun selectOffProduct(
        product: OpenFoodFactsProduct,
        onResolved: (Food) -> Unit,
    ) = search.selectOffProduct(product, onResolved)

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
