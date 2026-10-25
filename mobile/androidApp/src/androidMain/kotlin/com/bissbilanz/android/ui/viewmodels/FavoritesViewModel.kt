package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.MealLogDetails
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.resolveDefaultMeal
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class FavoritesViewModel(
    private val foodRepo: FoodRepository,
    private val recipeRepo: RecipeRepository,
    private val entryRepo: EntryRepository,
    private val prefsRepo: PreferencesRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    val favorites: StateFlow<List<Food>> =
        foodRepo
            .favorites()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val recipes: StateFlow<List<Recipe>> =
        recipeRepo
            .allRecipes()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    // Eagerly: only read through .value at tap time, never collected by the screen,
    // so WhileSubscribed would leave it null and ignore the default-meal prefs.
    val preferences: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                foodRepo.refreshFavorites()
                recipeRepo.refresh()
                prefsRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.favorites_load_failed)
            }
            _isLoading.value = false
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    fun resolveDefaultMeal(): String? = resolveDefaultMeal(preferences.value)

    val tapAction: String
        get() = preferences.value?.favoriteTapAction ?: "instant"

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

    fun logRecipe(
        recipe: Recipe,
        details: MealLogDetails,
    ) {
        viewModelScope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(
                        recipeId = recipe.id,
                        mealType = details.mealType,
                        servings = details.servings,
                        date = details.date,
                        eatenAt = details.eatenAt,
                        notes = details.notes,
                    ),
                    recipe = recipe,
                )
                _snackbarMessage.value = UiMessage(R.string.food_detail_logged, listOf(recipe.name))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.recipe_list_log_failed)
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
