package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn

class FavoritesViewModel(
    private val foodRepo: FoodRepository,
    private val recipeRepo: RecipeRepository,
    private val entryRepo: EntryRepository,
    private val prefsRepo: PreferencesRepository,
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

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    val preferences: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    init {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                foodRepo.refreshFavorites()
                recipeRepo.refresh()
                prefsRepo.refresh()
            } catch (_: Exception) {
            }
            _isLoading.value = false
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    fun resolveDefaultMeal(): String? {
        val prefs = preferences.value ?: return null
        if (prefs.favoriteMealAssignmentMode == "ask_meal") return null

        val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
        val minuteOfDay = now.hour * 60 + now.minute

        for (timeframe in prefs.favoriteMealTimeframes) {
            if (minuteOfDay >= timeframe.startMinute && minuteOfDay < timeframe.endMinute) {
                return timeframe.mealType
            }
        }
        return null
    }

    val tapAction: String
        get() = preferences.value?.favoriteTapAction ?: "instant"

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
