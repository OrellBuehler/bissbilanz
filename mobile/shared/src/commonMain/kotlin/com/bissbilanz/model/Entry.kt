package com.bissbilanz.model

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeDetail
import kotlinx.serialization.Serializable

@Serializable
data class Entry(
    val id: String,
    val userId: String = "",
    val foodId: String? = null,
    val recipeId: String? = null,
    // Set on the ingredient entries the server creates for a logged supplement.
    // Carried locally so the migration back up doesn't re-upload them as ordinary
    // entries on top of the ones `logSupplement` recreates server-side.
    val supplementId: String? = null,
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
    val quickNutrients: Map<String, Double>? = null,
    val eatenAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val food: Food? = null,
    val recipe: RecipeDetail? = null,
    val foodName: String? = null,
    val calories: Double? = null,
    val protein: Double? = null,
    val carbs: Double? = null,
    val fat: Double? = null,
    val fiber: Double? = null,
    val servingSize: Double? = null,
    val servingUnit: String? = null,
)
