package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.util.totalMacros
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlinx.serialization.json.Json

class StatsRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
    private val json: Json,
) {
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        try {
            api.getDailyStats(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            // Compute basic daily stats from cached entries
            if (!connectivity.isOnline.value) {
                computeDailyStatsFromCache(startDate, endDate)
            } else {
                throw e
            }
        }

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

    suspend fun getCalendarStats(month: String): List<CalendarDay> {
        val response = api.getCalendarStats(month)
        val days =
            response.days.map { (date, raw) ->
                CalendarDay(
                    date = date,
                    calories = raw.calories,
                    hasEntries = raw.hasEntries,
                )
            }
        return days.sortedBy { it.date }
    }

    private fun computeDailyStatsFromCache(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse {
        val data = mutableListOf<DailyStatsEntry>()
        var current = startDate
        while (current <= endDate) {
            val rows = db.bissbilanzDatabaseQueries.selectEntriesByDate(current).executeAsList()
            if (rows.isNotEmpty()) {
                val entries = rows.map { json.decodeFromString<Entry>(it.jsonData) }
                val totals = entries.totalMacros()
                data.add(
                    DailyStatsEntry(
                        date = current,
                        calories = totals.calories,
                        protein = totals.protein,
                        carbs = totals.carbs,
                        fat = totals.fat,
                        fiber = totals.fiber,
                    ),
                )
            }
            current = LocalDate.parse(current).plus(1, DateTimeUnit.DAY).toString()
        }

        val goals =
            db.bissbilanzDatabaseQueries.selectGoals().executeAsOneOrNull()?.let {
                Goals(
                    calorieGoal = it.calorieGoal,
                    proteinGoal = it.proteinGoal,
                    carbGoal = it.carbGoal,
                    fatGoal = it.fatGoal,
                    fiberGoal = it.fiberGoal,
                )
            }
        return DailyStatsResponse(data = data, goals = goals)
    }
}
