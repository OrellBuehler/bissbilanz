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
data class WeeklyMonthlyStatsResponse(
    val stats: MacroTotals,
)

@Serializable
data class MealBreakdownResponse(
    val data: List<MealBreakdownEntry>,
)

@Serializable
data class TopFoodsResponse(
    val data: List<TopFoodEntry>,
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
