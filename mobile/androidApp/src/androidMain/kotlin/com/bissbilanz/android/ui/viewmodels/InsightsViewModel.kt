package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.model.*
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.StatsRepository
import io.sentry.Sentry
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

    private val _calendarDays = MutableStateFlow<List<CalendarDay>>(emptyList())
    val calendarDays: StateFlow<List<CalendarDay>> = _calendarDays.asStateFlow()

    private val _calendarMonth = MutableStateFlow(Clock.System.todayIn(TimeZone.currentSystemDefault()).monthNumber)
    val calendarMonth: StateFlow<Int> = _calendarMonth.asStateFlow()

    private val _calendarYear = MutableStateFlow(Clock.System.todayIn(TimeZone.currentSystemDefault()).year)
    val calendarYear: StateFlow<Int> = _calendarYear.asStateFlow()

    init {
        loadData()
        loadCalendarStats()
    }

    fun selectRange(index: Int) {
        _selectedRange.value = index
        loadData()
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

    private fun loadCalendarStats() {
        viewModelScope.launch {
            val monthStr = "%04d-%02d".format(_calendarYear.value, _calendarMonth.value)
            try {
                _calendarDays.value = statsRepo.getCalendarStats(monthStr)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Sentry.captureException(e)
                _calendarDays.value = emptyList()
            }
        }
    }

    private fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
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
                                Sentry.captureException(e)
                                null
                            }
                        }
                    val monthlyDeferred =
                        async {
                            try {
                                statsRepo.getMonthlyStats().stats
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
                                null
                            }
                        }
                    val streaksDeferred =
                        async {
                            try {
                                statsRepo.getStreaks()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
                                null
                            }
                        }
                    val topFoodsDeferred =
                        async {
                            try {
                                statsRepo.getTopFoods(days).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
                                emptyList()
                            }
                        }
                    val dailyStatsDeferred =
                        async {
                            try {
                                statsRepo.getDailyStats(startDate, endDate).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
                                emptyList()
                            }
                        }
                    val mealBreakdownDeferred =
                        async {
                            try {
                                statsRepo.getMealBreakdown(startDate, endDate).data
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
                                emptyList()
                            }
                        }
                    val goalsDeferred =
                        async {
                            try {
                                goalsRepo.refresh()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Sentry.captureException(e)
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
                Sentry.captureException(e)
            } finally {
                _isLoading.value = false
            }
        }
    }
}
