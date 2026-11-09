package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.TopFoodItem
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.model.Food
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.StatsRepository
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus

/**
 * The data behind the optional dashboard cards. It lives here rather than in the cards
 * so it survives the dashboard leaving composition: coming back from another screen
 * shows the last values at once instead of restarting empty, which also keeps the
 * scroll position from being clamped while the page is short.
 *
 * `null` means "not loaded yet", as opposed to a loaded empty list.
 */
class DashboardWidgetsViewModel(
    foodRepo: FoodRepository,
    recipeRepo: RecipeRepository,
    goalsRepo: GoalsRepository,
    prefsRepo: PreferencesRepository,
    weightRepo: WeightRepository,
    sleepRepo: SleepRepository,
    private val supplementRepo: SupplementRepository,
    private val statsRepo: StatsRepository,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private fun <T> Flow<T>.shared(): StateFlow<T?> = stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val favorites: StateFlow<List<Food>?> = foodRepo.favorites().shared()
    val recipes: StateFlow<List<RecipeDetail>?> = recipeRepo.allRecipes().shared()
    val goals: StateFlow<Goals?> = goalsRepo.goals().shared()
    val prefs: StateFlow<Preferences?> = prefsRepo.preferences().shared()
    val weightEntries: StateFlow<List<WeightEntry>?> = weightRepo.entries().shared()
    val sleepEntries: StateFlow<List<SleepEntry>?> = sleepRepo.entries().shared()
    val supplements: StateFlow<List<Supplement>?> = supplementRepo.supplements().shared()

    private val _calorieSeries = MutableStateFlow<List<Pair<String, Double>>?>(null)
    val calorieSeries: StateFlow<List<Pair<String, Double>>?> = _calorieSeries.asStateFlow()

    private val _topFoods = MutableStateFlow<List<TopFoodItem>?>(null)
    val topFoods: StateFlow<List<TopFoodItem>?> = _topFoods.asStateFlow()

    private val _takenByDate = MutableStateFlow<Map<String, Set<String>>>(emptyMap())

    /** Taken supplement ids per day; a day that is absent has not been read yet. */
    val takenByDate: StateFlow<Map<String, Set<String>>> = _takenByDate.asStateFlow()

    /** Fetches the seven days ending on [date]. A failure keeps what is on screen. */
    suspend fun loadCalorieSeries(date: String) {
        val end = runCatching { LocalDate.parse(date) }.getOrNull() ?: return
        val start = end.minus(6, DateTimeUnit.DAY)
        try {
            _calorieSeries.value =
                statsRepo.getDailyStats(start.toString(), end.toString()).data.map { it.date to it.calories }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            if (_calorieSeries.value == null) _calorieSeries.value = emptyList()
        }
    }

    suspend fun loadTopFoods() {
        try {
            _topFoods.value = statsRepo.getTopFoods(days = 7, limit = 5).data
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            if (_topFoods.value == null) _topFoods.value = emptyList()
        }
    }

    /**
     * Seeds [date] from the local cache straight away, so a day switch never shows the
     * previous day's ticks, then replaces it with the server's answer.
     */
    suspend fun loadChecklist(date: String) {
        if (date !in _takenByDate.value) {
            val cached = supplementRepo.cachedChecklist(date).map { it.supplementId }.toSet()
            _takenByDate.update { it + (date to cached) }
        }
        val taken = supplementRepo.getChecklist(date).map { it.supplementId }.toSet()
        _takenByDate.update { it + (date to taken) }
    }

    fun setSupplementTaken(
        supplementId: String,
        date: String,
        taken: Boolean,
    ) {
        setTakenLocally(date, supplementId, taken)
        viewModelScope.launch {
            try {
                if (taken) {
                    supplementRepo.logSupplement(supplementId, date)
                } else {
                    supplementRepo.unlogSupplement(supplementId, date)
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                setTakenLocally(date, supplementId, !taken)
            }
        }
    }

    private fun setTakenLocally(
        date: String,
        supplementId: String,
        taken: Boolean,
    ) {
        _takenByDate.update { all ->
            val current = all[date] ?: return@update all
            all + (date to if (taken) current + supplementId else current - supplementId)
        }
    }
}
