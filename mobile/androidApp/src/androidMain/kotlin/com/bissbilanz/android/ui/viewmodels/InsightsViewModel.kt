package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.analytics.*
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
) : ViewModel() {
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

    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    private val _selectedRange = MutableStateFlow(0)
    val selectedRange: StateFlow<Int> = _selectedRange.asStateFlow()

    private val _calendarDays = MutableStateFlow<List<CalendarDay>>(emptyList())
    val calendarDays: StateFlow<List<CalendarDay>> = _calendarDays.asStateFlow()

    private val _calendarMonth = MutableStateFlow(Clock.System.todayIn(TimeZone.currentSystemDefault()).monthNumber)
    val calendarMonth: StateFlow<Int> = _calendarMonth.asStateFlow()

    private val _calendarYear = MutableStateFlow(Clock.System.todayIn(TimeZone.currentSystemDefault()).year)
    val calendarYear: StateFlow<Int> = _calendarYear.asStateFlow()

    // Sleep
    val sleepEntries: StateFlow<List<SleepEntry>> =
        sleepRepo
            .entries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _sleepFoodCorrelation = MutableStateFlow<List<SleepFoodCorrelationEntry>>(emptyList())
    val sleepFoodCorrelation: StateFlow<List<SleepFoodCorrelationEntry>> = _sleepFoodCorrelation.asStateFlow()

    // Tab navigation
    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    // Loading
    private val _analyticsLoading = MutableStateFlow(false)
    val analyticsLoading: StateFlow<Boolean> = _analyticsLoading.asStateFlow()

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
    private val _nutrientAdequacyResult = MutableStateFlow<List<Pair<RdaEntry, Double>>>(emptyList())
    val nutrientAdequacyResult: StateFlow<List<Pair<RdaEntry, Double>>> = _nutrientAdequacyResult.asStateFlow()

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

    init {
        loadData()
        loadCalendarStats()
        loadSleepData()
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
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
        _selectedRange.value = index
        loadedTabs.clear()
        loadedTabs.add(0)
        loadData()
        if (_selectedTab.value != 0) {
            selectTab(_selectedTab.value)
        }
    }

    private fun dateRange(): Pair<String, String> {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val days =
            when (_selectedRange.value) {
                0 -> 7
                1 -> 30
                else -> 90
            }
        val startDate = today.minus(days, DateTimeUnit.DAY).toString()
        val endDate = today.toString()
        return Pair(startDate, endDate)
    }

    fun prevMonth() {
        var m = _calendarMonth.value - 1
        var y = _calendarYear.value
        if (m < 1) {
            m = 12
            y--
        }
        _calendarMonth.value = m
        _calendarYear.value = y
        loadCalendarStats()
    }

    fun nextMonth() {
        var m = _calendarMonth.value + 1
        var y = _calendarYear.value
        if (m > 12) {
            m = 1
            y++
        }
        _calendarMonth.value = m
        _calendarYear.value = y
        loadCalendarStats()
    }

    fun loadCalendarStats() {
        viewModelScope.launch {
            val monthStr = "%04d-%02d".format(_calendarYear.value, _calendarMonth.value)
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
                _snackbarMessage.value = "Sleep logged"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to log sleep"
            }
        }
    }

    fun deleteSleepEntry(id: String) {
        viewModelScope.launch {
            try {
                sleepRepo.deleteEntry(id)
                _snackbarMessage.value = "Sleep entry deleted"
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = "Failed to delete"
            }
        }
    }

    fun loadData() {
        viewModelScope.launch {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val days =
                when (_selectedRange.value) {
                    0 -> 7
                    1 -> 30
                    else -> 90
                }
            val startDate = today.minus(days, DateTimeUnit.DAY).toString()
            val endDate = today.toString()

            try {
                coroutineScope {
                    val weeklyDeferred =
                        async {
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
                _snackbarMessage.value = "Failed to load insights"
            }
        }
    }

    fun loadNutritionAnalytics() {
        viewModelScope.launch {
            _analyticsLoading.value = true
            val (startDate, endDate) = dateRange()
            try {
                coroutineScope {
                    val extDeferred = async { analyticsRepo.getNutrientsExtended(startDate, endDate) }
                    val dailyDeferred = async { analyticsRepo.getNutrientsDaily(startDate, endDate) }
                    val timingDeferred = async { analyticsRepo.getMealTiming(startDate, endDate) }
                    val divDeferred = async { analyticsRepo.getFoodDiversity(startDate, endDate) }

                    val extResponse = extDeferred.await()
                    val dailyResponse = dailyDeferred.await()
                    val timingResponse = timingDeferred.await()
                    val divResponse = divDeferred.await()

                    val extData = extResponse?.data ?: emptyList()
                    val dailyData = dailyResponse?.data ?: emptyList()
                    val timingData = timingResponse?.data ?: emptyList()
                    val divData = divResponse?.data ?: emptyList()

                    _novaResult.value = computeNOVAScore(extData.map { Pair(it.calories, it.novaGroup) })
                    _omegaResult.value =
                        computeOmegaRatio(
                            extData.groupBy { it.date }.map { (date, entries) ->
                                Triple(date, entries.sumOf { it.omega3 ?: 0.0 }, entries.sumOf { it.omega6 ?: 0.0 })
                            },
                        )
                    _diiResult.value =
                        computeDIIScore(
                            extData.groupBy { it.date }.map { (_, entries) ->
                                DIIInput(
                                    fiber = entries.sumOf { it.fiber },
                                    omega3 = entries.sumOf { it.omega3 ?: 0.0 },
                                    vitaminC = entries.sumOf { it.vitaminC ?: 0.0 },
                                    vitaminD = entries.sumOf { it.vitaminD ?: 0.0 },
                                    vitaminE = entries.sumOf { it.vitaminE ?: 0.0 },
                                    saturatedFat = entries.sumOf { it.saturatedFat ?: 0.0 },
                                    transFat = entries.sumOf { it.transFat ?: 0.0 },
                                    alcohol = entries.sumOf { it.alcohol ?: 0.0 },
                                    caffeine = entries.sumOf { it.caffeine ?: 0.0 },
                                    sodium = entries.sumOf { it.sodium ?: 0.0 },
                                )
                            },
                        )
                    _tefResult.value = computeTEF(dailyData.map { TEFInput(it.protein, it.carbs, it.fat, it.calories) })
                    _proteinDistributionResult.value =
                        computeProteinDistribution(
                            extData.map { Triple(it.date, it.mealType, it.protein) },
                        )
                    _frontLoadingResult.value =
                        computeCalorieFrontLoading(
                            extData.map { Triple(it.date, it.eatenAt, it.calories) },
                        )
                    _calorieCyclingResult.value = computeCalorieCycling(dailyData.map { Pair(it.date, it.calories) })
                    _weekdayWeekendResult.value =
                        computeWeekdayWeekendSplit(
                            dailyData.map { DayEntry(it.date, it.calories, it.protein, it.carbs, it.fat, it.fiber) },
                        )
                    _mealRegularityResult.value =
                        computeMealRegularity(
                            timingData.map { RegularityInputEntry(it.date, it.mealType, it.eatenAt) },
                        )
                    _foodDiversityResult.value =
                        computeFoodDiversity(
                            divData.map { FoodEntry(it.date, it.foodId, it.recipeId, it.foodName) },
                        )
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadWeightAnalytics() {
        viewModelScope.launch {
            _analyticsLoading.value = true
            val (startDate, endDate) = dateRange()
            try {
                coroutineScope {
                    val weightDeferred = async { analyticsRepo.getWeightFood(startDate, endDate) }
                    val extDeferred = async { analyticsRepo.getNutrientsExtended(startDate, endDate) }
                    val dailyDeferred = async { analyticsRepo.getNutrientsDaily(startDate, endDate) }
                    val timingDeferred = async { analyticsRepo.getMealTiming(startDate, endDate) }

                    val weightResponse = weightDeferred.await()
                    val extResponse = extDeferred.await()
                    val dailyResponse = dailyDeferred.await()
                    val timingResponse = timingDeferred.await()

                    val weightFoodData = weightResponse?.data ?: emptyList()
                    val extData = extResponse?.data ?: emptyList()
                    val dailyData = dailyResponse?.data ?: emptyList()
                    val timingData = timingResponse?.data ?: emptyList()

                    val weightSeries = weightFoodData.map { Pair(it.date, it.weightKg) }
                    val calorieSeries = weightFoodData.map { Pair(it.date, it.calories) }

                    val tdee = computeAdaptiveTDEE(weightSeries, calorieSeries)
                    _tdeeResult.value = tdee
                    _plateauResult.value = detectPlateau(weightSeries, calorieSeries, tdee.estimatedTDEE)
                    _weightForecastResult.value = projectWeight(weightSeries, tdee.weeklyRate)
                    _sodiumWeightResult.value =
                        computeSodiumWeightCorrelation(
                            extData.groupBy { it.date }.map { (date, entries) ->
                                Pair(date, entries.sumOf { it.sodium ?: 0.0 })
                            },
                            weightSeries,
                        )
                    _caloricLagResult.value =
                        computeCaloricLag(
                            calorieSeries,
                            weightSeries,
                        )
                    _macroImpactResult.value =
                        computeNutrientOutcomeCorrelations(
                            dailyData.map { d ->
                                Pair(
                                    d.date,
                                    mapOf(
                                        "protein" to d.protein as Double?,
                                        "carbs" to d.carbs as Double?,
                                        "fat" to d.fat as Double?,
                                        "fiber" to d.fiber as Double?,
                                    ),
                                )
                            },
                            weightFoodData.mapNotNull { d -> d.weightKg?.let { Pair(d.date, it) } },
                        )
                    _mealTimingSummary.value =
                        extractMealTimingPatterns(
                            timingData.map { MealEntry(it.date, it.eatenAt, it.calories) },
                        )

                    val trackedKeys = setOf("vitaminC", "vitaminD", "vitaminE", "sodium", "omega3", "omega6", "fiber")
                    val dayCount =
                        extData
                            .map { it.date }
                            .distinct()
                            .size
                            .takeIf { it > 0 } ?: 1
                    val sumByKey = mutableMapOf<String, Double>()
                    for (entry in extData) {
                        sumByKey["vitaminC"] = (sumByKey["vitaminC"] ?: 0.0) + (entry.vitaminC ?: 0.0)
                        sumByKey["vitaminD"] = (sumByKey["vitaminD"] ?: 0.0) + (entry.vitaminD ?: 0.0)
                        sumByKey["vitaminE"] = (sumByKey["vitaminE"] ?: 0.0) + (entry.vitaminE ?: 0.0)
                        sumByKey["sodium"] = (sumByKey["sodium"] ?: 0.0) + (entry.sodium ?: 0.0)
                        sumByKey["omega3"] = (sumByKey["omega3"] ?: 0.0) + (entry.omega3 ?: 0.0)
                        sumByKey["omega6"] = (sumByKey["omega6"] ?: 0.0) + (entry.omega6 ?: 0.0)
                        sumByKey["fiber"] = (sumByKey["fiber"] ?: 0.0) + entry.fiber
                    }
                    _nutrientAdequacyResult.value =
                        RDA_VALUES
                            .filter { it.nutrientKey in trackedKeys }
                            .map { rda ->
                                val avg = (sumByKey[rda.nutrientKey] ?: 0.0) / dayCount
                                Pair(rda, avg / rda.rdaMale)
                            }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun loadSleepAnalytics() {
        viewModelScope.launch {
            _analyticsLoading.value = true
            val (startDate, endDate) = dateRange()
            try {
                coroutineScope {
                    val extDeferred = async { analyticsRepo.getNutrientsExtended(startDate, endDate) }
                    val timingDeferred = async { analyticsRepo.getMealTiming(startDate, endDate) }
                    val sleepFoodDeferred = async { analyticsRepo.getSleepFood(startDate, endDate) }

                    val extResponse = extDeferred.await()
                    val timingResponse = timingDeferred.await()
                    val sleepFoodResponse = sleepFoodDeferred.await()

                    val extData = extResponse?.data ?: emptyList()
                    val timingData = timingResponse?.data ?: emptyList()
                    val sleepFoodData = sleepFoodResponse?.data ?: emptyList()

                    val eveningFoods =
                        extData
                            .filter { entry ->
                                val eatenAt = entry.eatenAt ?: return@filter false
                                val hour = eatenAt.substring(11, 13).toIntOrNull() ?: return@filter false
                                hour >= 19
                            }.mapNotNull { entry ->
                                val id = entry.foodId ?: entry.recipeId ?: return@mapNotNull null
                                EveningFoodEntry(
                                    date = entry.date,
                                    foodId = id,
                                    foodName = entry.foodName,
                                    nutrients =
                                        mapOf(
                                            "calories" to entry.calories,
                                            "protein" to entry.protein,
                                            "carbs" to entry.carbs,
                                            "fat" to entry.fat,
                                            "fiber" to entry.fiber,
                                        ),
                                )
                            }
                    val sleepQualityPoints = sleepFoodData.map { SleepQualityPoint(it.date, it.sleepQuality.toDouble()) }

                    _foodSleepResult.value = detectFoodSleepPatterns(eveningFoods, sleepQualityPoints)
                    _nutrientSleepCorrelations.value =
                        computeNutrientOutcomeCorrelations(
                            extData.groupBy { it.date }.map { (date, entries) ->
                                Pair(
                                    date,
                                    mapOf(
                                        "protein" to entries.sumOf { it.protein } as Double?,
                                        "carbs" to entries.sumOf { it.carbs } as Double?,
                                        "fat" to entries.sumOf { it.fat } as Double?,
                                        "fiber" to entries.sumOf { it.fiber } as Double?,
                                    ),
                                )
                            },
                            sleepFoodData.map { Pair(it.date, it.sleepQuality.toDouble()) },
                        )
                    _preSleepTimingSummary.value =
                        extractMealTimingPatterns(
                            timingData.map { MealEntry(it.date, it.eatenAt, it.calories) },
                        )

                    val caffeineEntries =
                        extData
                            .filter { (it.caffeine ?: 0.0) > 0.0 }
                            .map { CaffeineEntry(it.date, it.eatenAt, it.caffeine!!) }
                    val sleepDataPoints =
                        sleepEntries.value.map {
                            SleepDataPoint(it.entryDate, it.quality.toDouble(), it.durationMinutes.toDouble())
                        }
                    _caffeineSleepResult.value = computeCaffeineSleepCutoff(caffeineEntries, sleepDataPoints)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            } finally {
                _analyticsLoading.value = false
            }
        }
    }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }
}
