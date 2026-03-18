package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Entry(
    val id: String,
    val userId: String = "",
    val foodId: String? = null,
    val recipeId: String? = null,
    val date: String = "",
    val mealType: String,
    val servings: Double,
    val notes: String? = null,
    val quickName: String? = null,
    val quickCalories: Double? = null,
    val quickProtein: Double? = null,
    val quickCarbs: Double? = null,
    val quickFat: Double? = null,
    val quickFiber: Double? = null,
    val eatenAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val food: Food? = null,
    val recipe: Recipe? = null,
    val foodName: String? = null,
    val calories: Double? = null,
    val protein: Double? = null,
    val carbs: Double? = null,
    val fat: Double? = null,
    val fiber: Double? = null,
    val servingSize: Double? = null,
    val servingUnit: String? = null,
)

@Serializable
data class EntriesResponse(
    val entries: List<Entry>,
    val total: Int = 0,
)

@Serializable
data class EntryResponse(
    val entry: Entry,
)
