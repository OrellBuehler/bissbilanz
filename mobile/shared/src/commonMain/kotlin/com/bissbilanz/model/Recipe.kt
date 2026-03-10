package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Recipe(
    val id: String,
    val userId: String,
    val name: String,
    val totalServings: Double,
    val isFavorite: Boolean = false,
    val imageUrl: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val ingredients: List<RecipeIngredient>? = null,
)

@Serializable
data class RecipeIngredient(
    val id: String? = null,
    val recipeId: String? = null,
    val foodId: String,
    val quantity: Double,
    val servingUnit: ServingUnit,
    val sortOrder: Int = 0,
    val food: Food? = null,
)

@Serializable
data class RecipeCreate(
    val name: String,
    val totalServings: Double,
    val ingredients: List<RecipeIngredientInput>,
    val isFavorite: Boolean? = null,
    val imageUrl: String? = null,
)

@Serializable
data class RecipeIngredientInput(
    val foodId: String,
    val quantity: Double,
    val servingUnit: ServingUnit,
)

@Serializable
data class RecipeUpdate(
    val name: String? = null,
    val totalServings: Double? = null,
    val ingredients: List<RecipeIngredientInput>? = null,
    val isFavorite: Boolean? = null,
    val imageUrl: String? = null,
)
