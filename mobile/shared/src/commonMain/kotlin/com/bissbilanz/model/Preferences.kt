package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Preferences(
    val showChartWidget: Boolean = true,
    val showFavoritesWidget: Boolean = true,
    val showSupplementsWidget: Boolean = true,
    val showWeightWidget: Boolean = true,
    val showMealBreakdownWidget: Boolean = true,
    val showTopFoodsWidget: Boolean = true,
    val widgetOrder: List<String> = emptyList(),
    val startPage: String = "dashboard",
    val favoriteTapAction: String = "instant",
    val favoriteMealAssignmentMode: String = "time_based",
    val visibleNutrients: List<String> = emptyList(),
    val locale: String? = null,
)

@Serializable
data class PreferencesUpdate(
    val showChartWidget: Boolean? = null,
    val showFavoritesWidget: Boolean? = null,
    val showSupplementsWidget: Boolean? = null,
    val showWeightWidget: Boolean? = null,
    val showMealBreakdownWidget: Boolean? = null,
    val showTopFoodsWidget: Boolean? = null,
    val widgetOrder: List<String>? = null,
    val startPage: String? = null,
    val favoriteTapAction: String? = null,
    val favoriteMealAssignmentMode: String? = null,
    val visibleNutrients: List<String>? = null,
    val locale: String? = null,
)

@Serializable
data class MealType(
    val id: String,
    val userId: String,
    val name: String,
    val sortOrder: Int,
    val createdAt: String? = null,
)
