package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.analytics.*
import com.bissbilanz.android.R
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.*
import com.bissbilanz.repository.AnalyticsRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.StatsRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.*

class InsightsViewModel(
    private val statsRepo: StatsRepository,
    private val goalsRepo: GoalsRepository,
    private val sleepRepo: SleepRepository,
    private val errorReporter: ErrorReporter,
    private val analyticsRepo: AnalyticsRepository,
    appModeManager: AppModeManager,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    /**
     * True when the app runs in anonymous Local mode. Server-only insights (weekly/monthly
     * stats, streaks, top foods, meal breakdown and all AnalyticsRepository-backed cards)
     * are skipped and their UI is hidden; locally computable data (daily stats, calendar,
     * goals, sleep log) keeps working. Constant for the lifetime of this ViewModel — mode
     * changes recreate the whole navigation graph.
     */
    val isLocalMode: Boolean = appModeManager.isLocal

    private val _weeklyStats = MutableStateFlow<MacroTotals?>(null)
    val weeklyStats: StateFlow<MacroTotals?> = _weeklyStats.asStateFlow()

    private val _monthlyStats = MutableStateFlow<MacroTotals?>(null)
    val monthlyStats: StateFlow<MacroTotals?> = _monthlyStats.asStateFlow()

    private val _streaks = MutableStateFlow<StreaksResponse?>(null)
    val streaks: StateFlow<StreaksResponse?> = _streaks.asStateFlow()

    private val _topFoods = MutableStateFlow<List<TopFoodEntry>>(emptyList())
    val topFoods: StateFlow<List<TopFoodEntry>> = _topFoods.asStateFlow()

    private val _dailyStats = MutableStateFlow<List<DailyStatsEntry>>(emptyList())
    val dailyStats: StateFlow<List<DailyStatsEntry>> = _dailyStats.asStateFlow()

    private val _mealBreakdown = MutableStateFlow<List<MealBreakdownEntry>>(emptyList())
    val mealBreakdown: StateFlow<List<MealBreakdownEntry>> = _mealBreakdown.asStateFlow()

    val goals: StateFlow<Goals?> =
        goalsRepo
            .goals()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private val _snackbarMessage = MutableStateFlow<Int?>(null)
    val snackbarMessage: StateFlow<Int?> = _snackbarMessage.asStateFlow()

    // Range, tab and calendar position are backed by SavedStateHandle so they
    // survive process death.
    val selectedRange: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_SELECTED_RANGE, 0)

    private val _calendarDays = MutableStateFlow<List<CalendarDay>>(emptyList())
    val calendarDays: StateFlow<List<CalendarDay>> = _calendarDays.asStateFlow()

    val calendarMonth: StateFlow<Int> =
        savedStateHandle.getStateFlow(
            KEY_CALENDAR_MONTH,
            Clock.System.todayIn(TimeZone.currentSystemDefault()).monthNumber,
        )

    val calendarYear: StateFlow<Int> =
        savedStateHandle.getStateFlow(
            KEY_CALENDAR_YEAR,
            Clock.System.todayIn(TimeZone.currentSystemDefault()).year,
        )

    // Sleep
    val sleepEntries: StateFlow<List<SleepEntry>> =
        sleepRepo
            .entries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _sleepFoodCorrelation = MutableStateFlow<List<SleepFoodCorrelationEntry>>(emptyList())
    val sleepFoodCorrelation: StateFlow<List<SleepFoodCorrelationEntry>> = _sleepFoodCorrelation.asStateFlow()

    // Tab navigation
    val selectedTab: StateFlow<Int> = savedStateHandle.getStateFlow(KEY_SELECTED_TAB, 0)

    // Loading
    private val _nutritionLoading = MutableStateFlow(false)
    val nutritionLoading: StateFlow<Boolean> = _nutritionLoading.asStateFlow()
    private val _weightLoading = MutableStateFlow(false)
    val weightLoading: StateFlow<Boolean> = _weightLoading.asStateFlow()
    private val _sleepLoading = MutableStateFlow(false)
    val sleepLoading: StateFlow<Boolean> = _sleepLoading.asStateFlow()

    // Nutrition results (10)
    private val _novaResult = MutableStateFlow<NOVAResult?>(null)
    val novaResult: StateFlow<NOVAResult?> = _novaResult.asStateFlow()
    private val _omegaResult = MutableStateFlow<OmegaResult?>(null)
    val omegaResult: StateFlow<OmegaResult?> = _omegaResult.asStateFlow()
    private val _diiResult = MutableStateFlow<DIIResult?>(null)
    val diiResult: StateFlow<DIIResult?> = _diiResult.asStateFlow()
    private val _tefResult = MutableStateFlow<TEFResult?>(null)
    val tefResult: StateFlow<TEFResult?> = _tefResult.asStateFlow()
    private val _proteinDistributionResult = MutableStateFlow<ProteinDistributionResult?>(null)
    val proteinDistributionResult: StateFlow<ProteinDistributionResult?> = _proteinDistributionResult.asStateFlow()
    private val _frontLoadingResult = MutableStateFlow<FrontLoadingResult?>(null)
    val frontLoadingResult: StateFlow<FrontLoadingResult?> = _frontLoadingResult.asStateFlow()
    private val _calorieCyclingResult = MutableStateFlow<CalorieCyclingResult?>(null)
    val calorieCyclingResult: StateFlow<CalorieCyclingResult?> = _calorieCyclingResult.asStateFlow()
    private val _weekdayWeekendResult = MutableStateFlow<WeekdayWeekendResult?>(null)
    val weekdayWeekendResult: StateFlow<WeekdayWeekendResult?> = _weekdayWeekendResult.asStateFlow()
    private val _mealRegularityResult = MutableStateFlow<MealRegularityResult?>(null)
    val mealRegularityResult: StateFlow<MealRegularityResult?> = _mealRegularityResult.asStateFlow()
    private val _foodDiversityResult = MutableStateFlow<FoodDiversityResult?>(null)
    val foodDiversityResult: StateFlow<FoodDiversityResult?> = _foodDiversityResult.asStateFlow()

    // Weight results (8)
    private val _tdeeResult = MutableStateFlow<TDEEResult?>(null)
    val tdeeResult: StateFlow<TDEEResult?> = _tdeeResult.asStateFlow()
    private val _plateauResult = MutableStateFlow<PlateauResult?>(null)
    val plateauResult: StateFlow<PlateauResult?> = _plateauResult.asStateFlow()
    private val _weightForecastResult = MutableStateFlow<WeightForecast?>(null)
    val weightForecastResult: StateFlow<WeightForecast?> = _weightForecastResult.asStateFlow()
    private val _sodiumWeightResult = MutableStateFlow<SodiumWeightResult?>(null)
    val sodiumWeightResult: StateFlow<SodiumWeightResult?> = _sodiumWeightResult.asStateFlow()
    private val _caloricLagResult = MutableStateFlow<CaloricLagResult?>(null)
    val caloricLagResult: StateFlow<CaloricLagResult?> = _caloricLagResult.asStateFlow()
    private val _macroImpactResult = MutableStateFlow<List<NutrientCorrelation>>(emptyList())
    val macroImpactResult: StateFlow<List<NutrientCorrelation>> = _macroImpactResult.asStateFlow()
    private val _mealTimingSummary = MutableStateFlow<MealTimingSummary?>(null)
    val mealTimingSummary: StateFlow<MealTimingSummary?> = _mealTimingSummary.asStateFlow()
    private val _nutrientAdequacyResult = MutableStateFlow<List<NutrientAdequacyItem>>(emptyList())
    val nutrientAdequacyResult: StateFlow<List<NutrientAdequacyItem>> = _nutrientAdequacyResult.asStateFlow()

    // Sleep results (4)
    private val _foodSleepResult = MutableStateFlow<FoodSleepResult?>(null)
    val foodSleepResult: StateFlow<FoodSleepResult?> = _foodSleepResult.asStateFlow()
    private val _nutrientSleepCorrelations = MutableStateFlow<List<NutrientCorrelation>>(emptyList())
    val nutrientSleepCorrelations: StateFlow<List<NutrientCorrelation>> = _nutrientSleepCorrelations.asStateFlow()
    private val _preSleepTimingSummary = MutableStateFlow<MealTimingSummary?>(null)
    val preSleepTimingSummary: StateFlow<MealTimingSummary?> = _preSleepTimingSummary.asStateFlow()
    private val _caffeineSleepResult = MutableStateFlow<CaffeineSleepResult?>(null)
    val caffeineSleepResult: StateFlow<CaffeineSleepResult?> = _caffeineSleepResult.asStateFlow()

    private val loadedTabs = mutableSetOf<Int>()

    private var cachedInsights: InsightsBundle? = null

    /** All three analytics tabs read the same bundle; compute it once per range. */
    private suspend fun getInsights(): InsightsBundle? {
        cachedInsights?.let { return it }
        val (start, end) = dateRange()
        return analyticsRepo
            .getInsights(start, end, TimeZone.currentSystemDefault().id)
            .also { cachedInsights = it }
    }

    init {
        loadData()
        loadCalendarStats()
        loadSleepData()
        // After process death the restored tab's analytics have not been loaded
        // in this instance yet — re-trigger its load.
        if (selectedTab.value != 0) {
            selectTab(selectedTab.value)
        }
    }

    fun selectTab(index: Int) {
        savedStateHandle[KEY_SELECTED_TAB] = index
        if (index !in loadedTabs) {
            loadedTabs.add(index)
            when (index) {
                1 -> loadNutritionAnalytics()
                2 -> loadWeightAnalytics()
                3 -> loadSleepAnalytics()
            }
        }
    }

    fun selectRange(index: Int) {
        savedStateHandle[KEY_SELECTED_RANGE] = index
        loadedTabs.clear()
        loadedTabs.add(0)
        cachedInsights = null
        loadData()
        if (selectedTab.value != 0) {
            selectTab(selectedTab.value)
        }
    }

    private fun dateRange(): Pair<String, String> {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val days =
            when (selectedRange.value) {
                0 -> 7
                1 -> 30
                else -> 90
            }
        val startDate = today.minus(days, DateTimeUnit.DAY).toString()
        val endDate = today.toString()
        return Pair(startDate, endDate)
    }

    fun prevMonth() {
        var m = calendarMonth.value - 1
        var y = calendarYear.value
        if (m < 1) {
            m = 12
            y--
        }
        savedStateHandle[KEY_CALENDAR_MONTH] = m
        savedStateHandle[KEY_CALENDAR_YEAR] = y
        loadCalendarStats()
    }

    fun nextMonth() {
        var m = calendarMonth.value + 1
        var y = calendarYear.value
        if (m > 12) {
            m = 1
            y++
        }
        savedStateHandle[KEY_CALENDAR_MONTH] = m
        savedStateHandle[KEY_CALENDAR_YEAR] = y
        loadCalendarStats()
    }

    fun loadCalendarStats() {
        viewModelScope.launch {
            val monthStr = "%04d-%02d".format(calendarYear.value, calendarMonth.value)
            try {
                _calendarDays.value = statsRepo.getCalendarStats(monthStr)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _calendarDays.value = emptyList()
            }
        }
    }

    fun loadSleepData() {
        viewModelScope.launch {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val startDate = today.minus(59, DateTimeUnit.DAY).toString()
            val endDate = today.toString()
            try {
                coroutineScope {
                    launch { sleepRepo.refresh(startDate, endDate) }
                    launch {
                        _sleepFoodCorrelation.value = sleepRepo.getSleepFoodCorrelation(startDate, endDate)
                    }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    fun createSleepEntry(entry: SleepCreate) {
        viewModelScope.launch {
            try {
                sleepRepo.createEntry(entry)
                _snackbarMessage.value = R.string.sleep_logged
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = R.string.sleep_log_failed
            }
        }
    }

    fun deleteSleepEntry(id: String) {
        viewModelScope.launch {
            try {
                sleepRepo.deleteEntry(id)
                _snackbarMessage.value = R.string.sleep_deleted
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = R.string.sleep_delete_failed
            }
        }
    }

    fun loadData() {
        viewModelScope.launch {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val days =
                when (selectedRange.value) {
                    0 -> 7
                    1 -> 30
                    else -> 90
                }
            val startDate = today.minus(days, DateTimeUnit.DAY).toString()
            val endDate = today.toString()

            try {
                coroutineScope {
                    // Weekly/monthly stats, streaks, top foods and meal breakdown are
                    // server-only; in Local mode they stay empty and their cards are hidden.
                    val weeklyDeferred =
                        async {
                            if (isLocalMode) return@async null
                            try {
                                statsRepo.getWeeklyStats().stats
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                null
                            }
                        }
                    val monthlyDeferred =
                        async {
                            if (isLocalMode) return@async null
                            try {
                                statsRepo.getMonthlyStats().stats
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                null
                            }
                        }
                    val streaksDeferred =
                        async {
                            if (isLocalMode) return@async null
                            try {
                                statsRepo.getStreaks()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                null
                            }
                        }
                    val topFoodsDeferred =
                        async {
                            if (isLocalMode) return@async emptyList()
                            try {
                                statsRepo.getTopFoods(days).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                emptyList()
                            }
                        }
                    val dailyStatsDeferred =
                        async {
                            try {
                                statsRepo.getDailyStats(startDate, endDate).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                emptyList()
                            }
                        }
                    val mealBreakdownDeferred =
                        async {
                            if (isLocalMode) return@async emptyList()
                            try {
                                statsRepo.getMealBreakdown(startDate, endDate).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                emptyList()
                            }
                        }
                    val goalsDeferred =
                        async {
                            try {
                                goalsRepo.refresh()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                            }
                        }

                    _weeklyStats.value = weeklyDeferred.await()
                    _monthlyStats.value = monthlyDeferred.await()
                    _streaks.value = streaksDeferred.await()
                    _topFoods.value = topFoodsDeferred.await()
                    _dailyStats.value = dailyStatsDeferred.await()
                    _mealBreakdown.value = mealBreakdownDeferred.await()
                    goalsDeferred.await()
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = R.string.insights_load_failed
            }
        }
    }

    fun loadNutritionAnalytics() {
        loadTab(_nutritionLoading) { b ->
            _novaResult.value = b.nova
            _omegaResult.value = b.omega
            _diiResult.value = b.dii
            _tefResult.value = b.tef
            _proteinDistributionResult.value = b.proteinDistribution
            _frontLoadingResult.value = b.frontLoading
            _calorieCyclingResult.value = b.calorieCycling
            _weekdayWeekendResult.value = b.weekdayWeekend
            _mealRegularityResult.value = b.mealRegularity
            _foodDiversityResult.value = b.foodDiversity
        }
    }

    fun loadWeightAnalytics() {
        loadTab(_weightLoading) { b ->
            _tdeeResult.value = b.tdee
            _plateauResult.value = b.plateau
            _weightForecastResult.value = b.weightForecast
            _sodiumWeightResult.value = b.sodiumWeight
            _caloricLagResult.value = b.caloricLag
            _macroImpactResult.value = b.macroImpact
            _mealTimingSummary.value = b.mealTiming
            _nutrientAdequacyResult.value = b.nutrientAdequacy
        }
    }

    fun loadSleepAnalytics() {
        loadTab(_sleepLoading) { b ->
            _foodSleepResult.value = b.foodSleep
            _nutrientSleepCorrelations.value = b.nutrientSleep
            _preSleepTimingSummary.value = b.preSleepTiming
            _caffeineSleepResult.value = b.caffeineSleep
        }
    }

    /**
     * Computes the insights bundle once per range and hands it to [publish], which
     * fans it out to one tab's flows. The bundle is memoised, so switching tabs
     * within a range costs nothing.
     */
    private fun loadTab(
        loading: MutableStateFlow<Boolean>,
        publish: (InsightsBundle) -> Unit,
    ) {
        viewModelScope.launch {
            loading.value = true
            try {
                getInsights()?.let(publish)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                loading.value = false
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    companion object {
        private const val KEY_SELECTED_RANGE = "selectedRange"
        private const val KEY_SELECTED_TAB = "selectedTab"
        private const val KEY_CALENDAR_MONTH = "calendarMonth"
        private const val KEY_CALENDAR_YEAR = "calendarYear"
    }
}
