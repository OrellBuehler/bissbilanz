package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.ConnectivityProvider
import kotlinx.serialization.json.Json

class StatsRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        try {
            api.getDailyStats(startDate, endDate)
        } catch (e: Exception) {
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

    suspend fun getCalendarStats(month: String): CalendarResponse = api.getCalendarStats(month)

    private fun computeDailyStatsFromCache(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse {
        // Generate date range and compute totals from cached entries
        val data = mutableListOf<DailyStatsEntry>()
        var current = startDate
        while (current <= endDate) {
            val entries =
                db.bissbilanzDatabaseQueries.selectEntriesByDate(current).executeAsList()
            if (entries.isNotEmpty()) {
                var calories = 0.0
                var protein = 0.0
                var carbs = 0.0
                var fat = 0.0
                var fiber = 0.0
                entries.forEach { entry ->
                    val decoded = json.decodeFromString<Entry>(entry.jsonData)
                    val s = decoded.servings
                    val food = decoded.food
                    if (food != null) {
                        calories += food.calories * s
                        protein += food.protein * s
                        carbs += food.carbs * s
                        fat += food.fat * s
                        fiber += food.fiber * s
                    } else {
                        calories += (decoded.quickCalories ?: 0.0) * s
                        protein += (decoded.quickProtein ?: 0.0) * s
                        carbs += (decoded.quickCarbs ?: 0.0) * s
                        fat += (decoded.quickFat ?: 0.0) * s
                        fiber += (decoded.quickFiber ?: 0.0) * s
                    }
                }
                data.add(
                    DailyStatsEntry(
                        date = current,
                        calories = calories,
                        protein = protein,
                        carbs = carbs,
                        fat = fat,
                        fiber = fiber,
                    ),
                )
            }
            current = incrementDate(current)
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

    private fun incrementDate(date: String): String {
        // Simple date increment for YYYY-MM-DD format
        val parts = date.split("-")
        val year = parts[0].toInt()
        val month = parts[1].toInt()
        val day = parts[2].toInt()
        val daysInMonth =
            when (month) {
                1, 3, 5, 7, 8, 10, 12 -> 31
                4, 6, 9, 11 -> 30
                2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
                else -> 30
            }
        return if (day < daysInMonth) {
            "$year-${month.toString().padStart(2, '0')}-${(day + 1).toString().padStart(2, '0')}"
        } else if (month < 12) {
            "$year-${(month + 1).toString().padStart(2, '0')}-01"
        } else {
            "${year + 1}-01-01"
        }
    }
}
