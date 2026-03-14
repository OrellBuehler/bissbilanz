package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Entry(
    val id: String,
    val userId: String,
    val foodId: String? = null,
    val recipeId: String? = null,
    val date: String,
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
)

@Serializable
data class EntryCreate(
    val foodId: String? = null,
    val recipeId: String? = null,
    val mealType: String,
    val servings: Double,
    val date: String,
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
    val date: String? = null,
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
data class EntriesResponse(
    val entries: List<Entry>,
    val total: Int = 0,
)

@Serializable
data class EntryResponse(
    val entry: Entry,
)
