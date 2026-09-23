package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.analytics.MacroBudget
import com.bissbilanz.analytics.RecipeSuggestion
import com.bissbilanz.analytics.SuggestionCandidate
import com.bissbilanz.analytics.SuggestionMacros
import com.bissbilanz.analytics.suggestRecipes
import com.bissbilanz.android.ui.components.MealLogDetails
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Goals
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.resolveDefaultMeal
import com.bissbilanz.util.totalMacros
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

/** A recipe paired with its scaled suggestion — what the list actually renders. */
data class SuggestedRecipe(
    val recipe: Recipe,
    val suggestion: RecipeSuggestion,
)

class RecipeSuggestionsViewModel(
    private val recipeRepo: RecipeRepository,
    private val entryRepo: EntryRepository,
    private val goalsRepo: GoalsRepository,
    private val prefsRepo: PreferencesRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val recipes: StateFlow<List<Recipe>> =
        recipeRepo
            .allRecipes()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val preferences: StateFlow<Preferences?> =
        prefsRepo
            .preferences()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val remaining: StateFlow<MacroBudget?> =
        combine(entryRepo.entriesByDate(today), goalsRepo.goals()) { entries, goals ->
            goals?.let {
                val consumed = entries.totalMacros()
                MacroBudget(
                    calories = it.calorieGoal - consumed.calories,
                    protein = it.proteinGoal - consumed.protein,
                    carbs = it.carbGoal - consumed.carbs,
                    fat = it.fatGoal - consumed.fat,
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val suggestions: StateFlow<List<SuggestedRecipe>> =
        combine(remaining, recipes) { budget, allRecipes ->
            if (budget == null || allRecipes.isEmpty()) return@combine emptyList()
            val candidates =
                allRecipes.map { recipe ->
                    SuggestionCandidate(
                        id = recipe.id,
                        name = recipe.name,
                        perServing = SuggestionMacros(recipe.calories, recipe.protein, recipe.carbs, recipe.fat, recipe.fiber),
                        isFavorite = recipe.isFavorite,
                    )
                }
            val byId = allRecipes.associateBy { it.id }
            suggestRecipes(budget, candidates).mapNotNull { s -> byId[s.id]?.let { SuggestedRecipe(it, s) } }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                entryRepo.refresh(today)
                recipeRepo.refresh()
                goalsRepo.refresh()
                prefsRepo.refresh()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
            _isLoading.value = false
        }
    }

    fun resolveDefaultMeal(): String? = resolveDefaultMeal(preferences.value)

    fun logRecipe(
        recipe: Recipe,
        details: MealLogDetails,
        loggedMessage: (String) -> String,
        failedMessage: String,
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
                _snackbarMessage.value = loggedMessage(recipe.name)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = failedMessage
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
