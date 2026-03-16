package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Goals(
    val calorieGoal: Double,
    val proteinGoal: Double,
    val carbGoal: Double,
    val fatGoal: Double,
    val fiberGoal: Double,
    val sodiumGoal: Double? = null,
    val sugarGoal: Double? = null,
)

@Serializable
data class MealType(
    val id: String,
    val userId: String,
    val name: String,
    val sortOrder: Int,
    val createdAt: String? = null,
)

@Serializable
data class SupplementLog(
    val id: String,
    val supplementId: String,
    val userId: String,
    val date: String,
    val takenAt: String,
    val createdAt: String? = null,
)

@Serializable
data class MaintenanceMeta(
    val weightEntries: Int,
    val foodEntryDays: Int,
    val totalDays: Int,
    val coverage: Double,
    val firstWeight: Double,
    val lastWeight: Double,
    val startDate: String,
    val endDate: String,
)

@Serializable
data class DailyStatsEntry(
    val date: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

@Serializable
data class MealBreakdownEntry(
    val mealType: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

@Serializable
data class TopFoodEntry(
    val foodId: String?,
    val recipeId: String?,
    val foodName: String,
    val count: Int,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

@Serializable
data class StreaksResponse(
    val currentStreak: Int,
    val longestStreak: Int,
)

@Serializable
data class EntryCreate(
    val mealType: String,
    val servings: Double,
    val date: String,
    val foodId: String? = null,
    val recipeId: String? = null,
    val notes: String? = null,
    val quickName: String? = null,
    val quickCalories: Double? = null,
    val quickProtein: Double? = null,
    val quickCarbs: Double? = null,
    val quickFat: Double? = null,
    val quickFiber: Double? = null,
    val eatenAt: String? = null,
)

@Serializable
data class EntryUpdate(
    val foodId: String? = null,
    val recipeId: String? = null,
    val mealType: String? = null,
    val servings: Double? = null,
    val notes: String? = null,
    val date: String? = null,
    val quickName: String? = null,
    val quickCalories: Double? = null,
    val quickProtein: Double? = null,
    val quickCarbs: Double? = null,
    val quickFat: Double? = null,
    val quickFiber: Double? = null,
    val eatenAt: String? = null,
)

@Serializable
data class WeightCreate(
    val weightKg: Double,
    val entryDate: String,
    val notes: String? = null,
)

@Serializable
data class WeightUpdate(
    val weightKg: Double? = null,
    val entryDate: String? = null,
    val notes: String? = null,
)
