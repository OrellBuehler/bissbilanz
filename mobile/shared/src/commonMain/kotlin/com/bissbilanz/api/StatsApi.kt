package com.bissbilanz.api

import com.bissbilanz.api.generated.model.CalendarResponse
import com.bissbilanz.api.generated.model.DailyStatsResponse
import com.bissbilanz.api.generated.model.FoodDiversityResponse
import com.bissbilanz.api.generated.model.MaintenanceResponse
import com.bissbilanz.api.generated.model.MealBreakdownResponse
import com.bissbilanz.api.generated.model.MealTimingResponse
import com.bissbilanz.api.generated.model.MonthlyStatsResponse
import com.bissbilanz.api.generated.model.NutrientsDailyResponse
import com.bissbilanz.api.generated.model.NutrientsExtendedResponse
import com.bissbilanz.api.generated.model.SleepFoodCorrelationEntry
import com.bissbilanz.api.generated.model.SleepFoodCorrelationResponse
import com.bissbilanz.api.generated.model.StreaksResponse
import com.bissbilanz.api.generated.model.TopFoodsResponse
import com.bissbilanz.api.generated.model.WeeklyStatsResponse
import com.bissbilanz.api.generated.model.WeightFoodResponse
import io.ktor.client.request.*

interface StatsApi : ApiTransport {
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        get("/api/stats/daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getWeeklyStats(): WeeklyStatsResponse = get("/api/stats/weekly")

    suspend fun getMonthlyStats(): MonthlyStatsResponse = get("/api/stats/monthly")

    suspend fun getMealBreakdown(date: String): MealBreakdownResponse = get("/api/stats/meal-breakdown") { parameter("date", date) }

    suspend fun getMealBreakdown(
        startDate: String,
        endDate: String,
    ): MealBreakdownResponse =
        get("/api/stats/meal-breakdown") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getStreaks(): StreaksResponse = get("/api/stats/streaks")

    /** [sort] is "count" (most logged) or a macro key, ranking by total contribution to it. */
    suspend fun getTopFoods(
        days: Int = 7,
        limit: Int = 10,
        sort: String = "count",
    ): TopFoodsResponse =
        get("/api/stats/top-foods") {
            parameter("days", days)
            parameter("limit", limit)
            parameter("sort", sort)
        }

    suspend fun getCalendarStats(month: String): CalendarResponse = get("/api/stats/calendar") { parameter("month", month) }

    suspend fun getMaintenanceCalories(
        startDate: String,
        endDate: String,
        muscleRatio: Double = 0.3,
    ): MaintenanceResponse =
        get("/api/maintenance") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
            parameter("muscleRatio", muscleRatio)
        }

    suspend fun getSleepFoodCorrelation(
        startDate: String,
        endDate: String,
    ): List<SleepFoodCorrelationEntry> {
        val response: SleepFoodCorrelationResponse =
            get("/api/analytics/sleep-food") {
                parameter("startDate", startDate)
                parameter("endDate", endDate)
            }
        return response.data
    }

    suspend fun getAnalyticsFoodDiversity(
        startDate: String,
        endDate: String,
    ): FoodDiversityResponse =
        get("/api/analytics/food-diversity") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsMealTiming(
        startDate: String,
        endDate: String,
    ): MealTimingResponse =
        get("/api/analytics/meal-timing") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsNutrientsDaily(
        startDate: String,
        endDate: String,
    ): NutrientsDailyResponse =
        get("/api/analytics/nutrients-daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsNutrientsExtended(
        startDate: String,
        endDate: String,
    ): NutrientsExtendedResponse =
        get("/api/analytics/nutrients-extended") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsWeightFood(
        startDate: String,
        endDate: String,
    ): WeightFoodResponse =
        get("/api/analytics/weight-food") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsSleepFood(
        startDate: String,
        endDate: String,
    ): SleepFoodCorrelationResponse =
        get("/api/analytics/sleep-food") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }
}
