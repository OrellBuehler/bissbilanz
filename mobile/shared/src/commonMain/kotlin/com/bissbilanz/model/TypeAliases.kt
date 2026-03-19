package com.bissbilanz.model

import com.bissbilanz.api.generated.model.DailyStat
import com.bissbilanz.api.generated.model.DailyStatsResponse as GeneratedDailyStatsResponse
import com.bissbilanz.api.generated.model.EntryCreate as GeneratedEntryCreate
import com.bissbilanz.api.generated.model.EntryUpdate as GeneratedEntryUpdate
import com.bissbilanz.api.generated.model.Food as GeneratedFood
import com.bissbilanz.api.generated.model.FoodCreate as GeneratedFoodCreate
import com.bissbilanz.api.generated.model.Goals as GeneratedGoals
import com.bissbilanz.api.generated.model.GoalsSummary as GeneratedGoalsSummary
import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.MaintenanceResponse as GeneratedMaintenanceResponse
import com.bissbilanz.api.generated.model.MealBreakdownItem
import com.bissbilanz.api.generated.model.MealBreakdownResponse as GeneratedMealBreakdownResponse
import com.bissbilanz.api.generated.model.MealType as GeneratedMealType
import com.bissbilanz.api.generated.model.MealTypeCreate as GeneratedMealTypeCreate
import com.bissbilanz.api.generated.model.MonthlyStatsResponse as GeneratedMonthlyStatsResponse
import com.bissbilanz.api.generated.model.Preferences as GeneratedPreferences
import com.bissbilanz.api.generated.model.PreferencesUpdate as GeneratedPreferencesUpdate
import com.bissbilanz.api.generated.model.FavoriteMealTimeframe as GeneratedFavoriteMealTimeframe
import com.bissbilanz.api.generated.model.GoalsUpdate as GeneratedGoalsUpdate
import com.bissbilanz.api.generated.model.RecipeCreate as GeneratedRecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient as GeneratedRecipeIngredient
import com.bissbilanz.api.generated.model.RecipeIngredientInput as GeneratedRecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeUpdate as GeneratedRecipeUpdate
import com.bissbilanz.api.generated.model.ServingUnit as GeneratedServingUnit
import com.bissbilanz.api.generated.model.StreaksResponse as GeneratedStreaksResponse
import com.bissbilanz.api.generated.model.Supplement as GeneratedSupplement
import com.bissbilanz.api.generated.model.SupplementCreate as GeneratedSupplementCreate
import com.bissbilanz.api.generated.model.SupplementHistoryItem
import com.bissbilanz.api.generated.model.SupplementHistoryResponse as GeneratedSupplementHistoryResponse
import com.bissbilanz.api.generated.model.SupplementIngredient as GeneratedSupplementIngredient
import com.bissbilanz.api.generated.model.SupplementIngredientInput as GeneratedSupplementIngredientInput
import com.bissbilanz.api.generated.model.SupplementLog as GeneratedSupplementLog
import com.bissbilanz.api.generated.model.TopFoodItem
import com.bissbilanz.api.generated.model.TopFoodsResponse as GeneratedTopFoodsResponse
import com.bissbilanz.api.generated.model.WeeklyStatsResponse as GeneratedWeeklyStatsResponse
import com.bissbilanz.api.generated.model.WeightCreate as GeneratedWeightCreate
import com.bissbilanz.api.generated.model.WeightEntry as GeneratedWeightEntry
import com.bissbilanz.api.generated.model.WeightTrendEntry as GeneratedWeightTrendEntry
import com.bissbilanz.api.generated.model.WeightUpdate as GeneratedWeightUpdate
import com.bissbilanz.api.generated.model.DayProperties as GeneratedDayProperties
import kotlinx.serialization.Serializable

// Core entity types
typealias Food = GeneratedFood
typealias FoodCreate = GeneratedFoodCreate
typealias Goals = GeneratedGoals
typealias GoalsSummary = GeneratedGoalsSummary
typealias Preferences = GeneratedPreferences
typealias PreferencesUpdate = GeneratedPreferencesUpdate
typealias FavoriteMealTimeframe = GeneratedFavoriteMealTimeframe
typealias GoalsUpdate = GeneratedGoalsUpdate
typealias Recipe = RecipeDetail
typealias RecipeCreate = GeneratedRecipeCreate
typealias RecipeIngredient = GeneratedRecipeIngredient
typealias RecipeIngredientInput = GeneratedRecipeIngredientInput
typealias RecipeUpdate = GeneratedRecipeUpdate
typealias Supplement = GeneratedSupplement
typealias SupplementCreate = GeneratedSupplementCreate
typealias SupplementLog = GeneratedSupplementLog
typealias SupplementIngredient = GeneratedSupplementIngredient
typealias SupplementIngredientInput = GeneratedSupplementIngredientInput
typealias ServingUnit = GeneratedServingUnit
typealias WeightEntry = GeneratedWeightEntry
typealias WeightCreate = GeneratedWeightCreate
typealias WeightUpdate = GeneratedWeightUpdate
typealias WeightTrendEntry = GeneratedWeightTrendEntry
typealias EntryCreate = GeneratedEntryCreate
typealias EntryUpdate = GeneratedEntryUpdate
typealias DayProperties = GeneratedDayProperties
typealias MealType = GeneratedMealType
typealias MealTypeCreate = GeneratedMealTypeCreate

// Nested enum aliases
typealias ScheduleType = GeneratedSupplement.ScheduleType
typealias TimeOfDay = GeneratedSupplement.TimeOfDay

// Stats types
typealias MacroTotals = MacroSummary
typealias DailyStatsEntry = DailyStat
typealias MealBreakdownEntry = MealBreakdownItem
typealias TopFoodEntry = TopFoodItem
typealias SupplementHistoryEntry = SupplementHistoryItem

// Response types
typealias DailyStatsResponse = GeneratedDailyStatsResponse
typealias WeeklyStatsResponse = GeneratedWeeklyStatsResponse
typealias MonthlyStatsResponse = GeneratedMonthlyStatsResponse
typealias MealBreakdownResponse = GeneratedMealBreakdownResponse
typealias TopFoodsResponse = GeneratedTopFoodsResponse
typealias StreaksResponse = GeneratedStreaksResponse
typealias SupplementHistoryResponse = GeneratedSupplementHistoryResponse
typealias MaintenanceResponse = GeneratedMaintenanceResponse

// Backwards-compatible alias for old unified type
typealias WeeklyMonthlyStatsResponse = GeneratedWeeklyStatsResponse

// CalendarDay with date field (generated type doesn't include date since it's the map key)
@Serializable
data class CalendarDay(
    val date: String,
    val calories: Double,
    val hasEntries: Boolean,
)
