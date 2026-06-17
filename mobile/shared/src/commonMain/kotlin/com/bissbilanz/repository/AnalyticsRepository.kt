package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Analytics + maintenance data source. These are now computed on-device from the
 * local SQLDelight cache via [LocalAnalytics] (issue #321) instead of the server
 * analytics endpoints, so they work for local/anonymous users with no network and
 * for online users without the API round-trip. The return types are the same
 * generated response DTOs the API used, so callers are unchanged.
 *
 * Computation runs on [Dispatchers.Default] because it reads the whole food/recipe
 * cache and resolves every entry; failures are reported and surface as null (or an
 * empty response) exactly like the previous API-backed implementation.
 */
class AnalyticsRepository(
    private val local: LocalAnalytics,
    private val errorReporter: ErrorReporter,
) {
    suspend fun getFoodDiversity(
        startDate: String,
        endDate: String,
    ): FoodDiversityResponse? = compute { local.foodDiversity(startDate, endDate) }

    suspend fun getMealTiming(
        startDate: String,
        endDate: String,
    ): MealTimingResponse? = compute { local.mealTiming(startDate, endDate) }

    suspend fun getNutrientsDaily(
        startDate: String,
        endDate: String,
    ): NutrientsDailyResponse? = compute { local.nutrientsDaily(startDate, endDate) }

    suspend fun getNutrientsExtended(
        startDate: String,
        endDate: String,
    ): NutrientsExtendedResponse? = compute { local.nutrientsExtended(startDate, endDate) }

    suspend fun getWeightFood(
        startDate: String,
        endDate: String,
    ): WeightFoodResponse? = compute { local.weightFood(startDate, endDate) }

    suspend fun getSleepFood(
        startDate: String,
        endDate: String,
    ): SleepFoodCorrelationResponse? = compute { local.sleepFood(startDate, endDate) }

    /** Null when the range lacks the inputs (fewer than two weight entries or no logged days). */
    suspend fun getMaintenance(
        startDate: String,
        endDate: String,
        muscleRatio: Double,
    ): MaintenanceResponse? = compute { local.maintenance(startDate, endDate, muscleRatio) }

    private suspend fun <T> compute(block: () -> T?): T? =
        try {
            withContext(Dispatchers.Default) { block() }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            null
        }
}
