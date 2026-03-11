package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*

class StatsRepository(
    private val api: BissbilanzApi,
) {
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse = api.getDailyStats(startDate, endDate)

    suspend fun getWeeklyStats(): WeeklyMonthlyStatsResponse = api.getWeeklyStats()

    suspend fun getMonthlyStats(): WeeklyMonthlyStatsResponse = api.getMonthlyStats()

    suspend fun getMealBreakdown(date: String): MealBreakdownResponse = api.getMealBreakdown(date)

    suspend fun getMealBreakdown(
        startDate: String,
        endDate: String,
    ): MealBreakdownResponse = api.getMealBreakdown(startDate, endDate)

    suspend fun getStreaks(): StreaksResponse = api.getStreaks()

    suspend fun getTopFoods(
        days: Int = 7,
        limit: Int = 10,
    ): TopFoodsResponse = api.getTopFoods(days, limit)

    suspend fun getCalendarStats(month: String): CalendarResponse = api.getCalendarStats(month)
}
