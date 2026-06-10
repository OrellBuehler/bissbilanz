package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.*
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.totalMacros
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlinx.serialization.json.Json

class StatsRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse {
        if (appModeManager.isLocal) return computeDailyStatsFromCache(startDate, endDate)
        return try {
            api.getDailyStats(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            computeDailyStatsFromCache(startDate, endDate)
        }
    }

    suspend fun getWeeklyStats(): WeeklyStatsResponse = api.getWeeklyStats()

    suspend fun getMonthlyStats(): MonthlyStatsResponse = api.getMonthlyStats()

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
        // In Local mode the local DB is complete, so the calendar is computed from cache.
        if (appModeManager.isLocal) return computeCalendarStatsFromCache(month)
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

    /** [month] is "YYYY-MM"; dates are zero-padded so string range comparison works. */
    private fun computeCalendarStatsFromCache(month: String): List<CalendarDay> =
        db.userDataDatabaseQueries
            .selectEntriesByDateRange("$month-01", "$month-31")
            .executeAsList()
            .groupBy { it.date }
            .map { (date, rows) ->
                val entries = rows.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }
                CalendarDay(
                    date = date,
                    calories = entries.totalMacros().calories,
                    hasEntries = entries.isNotEmpty(),
                )
            }.sortedBy { it.date }

    private fun computeDailyStatsFromCache(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse {
        val data = mutableListOf<DailyStatsEntry>()
        var current = startDate
        while (current <= endDate) {
            val rows = db.userDataDatabaseQueries.selectEntriesByDate(current).executeAsList()
            if (rows.isNotEmpty()) {
                val entries = rows.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }
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
            db.userDataDatabaseQueries.selectGoals().executeAsOneOrNull()?.let {
                GoalsSummary(
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
