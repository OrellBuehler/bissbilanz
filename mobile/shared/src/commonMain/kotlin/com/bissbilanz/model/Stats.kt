package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class MacroTotals(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
    val fiber: Double = 0.0
)

@Serializable
data class DailyStatsResponse(
    val data: List<DailyStatsEntry>,
    val goals: Goals? = null
)

@Serializable
data class DailyStatsEntry(
    val date: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double
)

@Serializable
data class WeeklyMonthlyStatsResponse(
    val stats: MacroTotals
)

@Serializable
data class MealBreakdownResponse(
    val data: List<MealBreakdownEntry>
)

@Serializable
data class MealBreakdownEntry(
    val mealType: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double
)

@Serializable
data class StreaksResponse(
    val currentStreak: Int,
    val longestStreak: Int
)

@Serializable
data class TopFoodsResponse(
    val data: List<TopFoodEntry>
)

@Serializable
data class TopFoodEntry(
    val foodId: String? = null,
    val recipeId: String? = null,
    val foodName: String,
    val count: Int,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double
)
