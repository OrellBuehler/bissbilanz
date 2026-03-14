package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class MacroTotals(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
    val fiber: Double = 0.0,
)

@Serializable
data class DailyStatsResponse(
    val data: List<DailyStatsEntry>,
    val goals: Goals? = null,
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
data class WeeklyMonthlyStatsResponse(
    val stats: MacroTotals,
)

@Serializable
data class MealBreakdownResponse(
    val data: List<MealBreakdownEntry>,
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
data class StreaksResponse(
    val currentStreak: Int,
    val longestStreak: Int,
)

@Serializable
data class TopFoodsResponse(
    val data: List<TopFoodEntry>,
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
    val fiber: Double,
)

@Serializable
data class CalendarDay(
    val date: String,
    val calories: Double,
    val goalMet: Boolean = false,
    val hasEntries: Boolean,
)

@Serializable
data class CalendarDayRaw(
    val calories: Double = 0.0,
    val hasEntries: Boolean = false,
)

@Serializable
data class CalendarResponse(
    val days: Map<String, CalendarDayRaw>,
)

@Serializable
data class CopyEntriesResponse(
    val entries: List<Entry>,
    val count: Int,
)

@Serializable
data class MaintenanceResult(
    val maintenanceCalories: Double,
    val dailyDeficitOrSurplus: Double,
    val weightChangeKg: Double,
    val fatMassChangeKg: Double,
    val muscleMassChangeKg: Double,
    val fatEnergyKcal: Double,
    val muscleEnergyKcal: Double,
    val avgDailyCalories: Double,
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
data class MaintenanceResponse(
    val result: MaintenanceResult,
    val meta: MaintenanceMeta,
)

@Serializable
data class MealTypeCreate(
    val name: String,
)

@Serializable
data class MealTypesResponse(
    val mealTypes: List<MealType>,
)
