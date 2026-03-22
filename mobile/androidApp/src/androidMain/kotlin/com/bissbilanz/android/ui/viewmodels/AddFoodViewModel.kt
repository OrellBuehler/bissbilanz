package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
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
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val recentFoods: StateFlow<List<Food>> = foodRepo.recentFoods

    val favoriteFoods: StateFlow<List<Food>> =
        foodRepo.favorites().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allRecipes: StateFlow<List<Recipe>> =
        recipeRepo.allRecipes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val favoriteRecipes: StateFlow<List<Recipe>> =
        allRecipes
            .map { list -> list.filter { it.isFavorite } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Food>>(emptyList())
    val searchResults: StateFlow<List<Food>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

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
        _isSearching.value = false
        searchJob?.cancel()
    }

    fun updateQuery(newQuery: String) {
        _query.value = newQuery
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                if (newQuery.length >= 2) {
                    delay(300)
                    _isSearching.value = true
                    _searchResults.value =
                        try {
                            foodRepo.searchFoods(newQuery)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            errorReporter.captureException(e)
                            _snackbarMessage.value = "Search failed"
                            emptyList()
                        }
                    _isSearching.value = false
                } else {
                    _searchResults.value = emptyList()
                }
            }
    }

    fun logFood(
        food: Food,
        mealType: String,
        servings: Double,
        date: String,
        onComplete: () -> Unit,
    ) {
        _isSaving.value = true
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(foodId = food.id, mealType = mealType, servings = servings, date = date),
                    food = food,
                )
                _snackbarMessage.value = "Logged ${food.name}"
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to log food"
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
        onComplete: () -> Unit,
    ) {
        _isSaving.value = true
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(recipeId = recipe.id, mealType = mealType, servings = servings, date = date),
                    recipe = recipe,
                )
                _snackbarMessage.value = "Logged ${recipe.name}"
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to log recipe"
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
                        notes = notes?.ifBlank { null },
                    ),
                )
                _snackbarMessage.value = "Logged $name"
                onComplete()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to log entry"
            } finally {
                _isSaving.value = false
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
