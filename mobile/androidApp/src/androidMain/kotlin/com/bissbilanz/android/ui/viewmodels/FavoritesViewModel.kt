package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class FavoritesViewModel(
    private val foodRepo: FoodRepository,
    private val recipeRepo: RecipeRepository,
    private val entryRepo: EntryRepository,
) : ViewModel() {
    val favorites: StateFlow<List<Food>> = foodRepo.favorites
    val recipes: StateFlow<List<Recipe>> = recipeRepo.recipes

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                foodRepo.loadFavorites()
                recipeRepo.loadRecipes()
            } catch (_: Exception) {
            }
            _isLoading.value = false
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
                entryRepo.createEntry(EntryCreate(foodId = food.id, mealType = meal, servings = servings, date = today))
                _snackbarMessage.value = "Logged ${food.name}"
            } catch (_: Exception) {
                _snackbarMessage.value = "Failed to log food"
            }
        }
    }

    fun logRecipe(
        recipe: Recipe,
        meal: String,
        servings: Double,
    ) {
        viewModelScope.launch {
            try {
                val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                entryRepo.createEntry(EntryCreate(recipeId = recipe.id, mealType = meal, servings = servings, date = today))
                _snackbarMessage.value = "Logged ${recipe.name}"
            } catch (_: Exception) {
                _snackbarMessage.value = "Failed to log recipe"
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
