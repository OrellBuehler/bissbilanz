package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.*
import com.bissbilanz.repository.GoalsRepository
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

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _selectedRange = MutableStateFlow(0)
    val selectedRange: StateFlow<Int> = _selectedRange.asStateFlow()

    init {
        loadData()
    }

    fun selectRange(index: Int) {
        _selectedRange.value = index
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val days = if (_selectedRange.value == 0) 7 else 30
            val startDate = today.minus(days, DateTimeUnit.DAY).toString()
            val endDate = today.toString()

            try {
                coroutineScope {
                    val weeklyDeferred =
                        async {
                            try {
                                statsRepo.getWeeklyStats().stats
                            } catch (_: Exception) {
                                null
                            }
                        }
                    val monthlyDeferred =
                        async {
                            try {
                                statsRepo.getMonthlyStats().stats
                            } catch (_: Exception) {
                                null
                            }
                        }
                    val streaksDeferred =
                        async {
                            try {
                                statsRepo.getStreaks()
                            } catch (_: Exception) {
                                null
                            }
                        }
                    val topFoodsDeferred =
                        async {
                            try {
                                statsRepo.getTopFoods(days).data
                            } catch (_: Exception) {
                                emptyList()
                            }
                        }
                    val dailyStatsDeferred =
                        async {
                            try {
                                statsRepo.getDailyStats(startDate, endDate).data
                            } catch (_: Exception) {
                                emptyList()
                            }
                        }
                    val mealBreakdownDeferred =
                        async {
                            try {
                                statsRepo.getMealBreakdown(startDate, endDate).data
                            } catch (_: Exception) {
                                emptyList()
                            }
                        }
                    val goalsDeferred =
                        async {
                            try {
                                goalsRepo.refresh()
                            } catch (_: Exception) {
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
                e.printStackTrace()
            } finally {
                _isLoading.value = false
            }
        }
    }
}
