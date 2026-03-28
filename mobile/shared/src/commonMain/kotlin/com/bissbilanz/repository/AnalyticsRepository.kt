package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*

class AnalyticsRepository(
    private val api: BissbilanzApi,
    private val errorReporter: ErrorReporter,
) {
    suspend fun getFoodDiversity(
        startDate: String,
        endDate: String,
    ): FoodDiversityResponse? =
        try {
            api.getAnalyticsFoodDiversity(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    suspend fun getMealTiming(
        startDate: String,
        endDate: String,
    ): MealTimingResponse? =
        try {
            api.getAnalyticsMealTiming(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    suspend fun getNutrientsDaily(
        startDate: String,
        endDate: String,
    ): NutrientsDailyResponse? =
        try {
            api.getAnalyticsNutrientsDaily(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    suspend fun getNutrientsExtended(
        startDate: String,
        endDate: String,
    ): NutrientsExtendedResponse? =
        try {
            api.getAnalyticsNutrientsExtended(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    suspend fun getWeightFood(
        startDate: String,
        endDate: String,
    ): WeightFoodResponse? =
        try {
            api.getAnalyticsWeightFood(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    suspend fun getSleepFood(
        startDate: String,
        endDate: String,
    ): SleepFoodCorrelationResponse? =
        try {
            api.getAnalyticsSleepFood(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }
}
