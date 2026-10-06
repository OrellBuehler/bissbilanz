package com.bissbilanz.util

import com.bissbilanz.api.generated.model.RecipeIngredient
import kotlin.math.floor

enum class RecipeScaleMode { Servings, Grams }

fun recipeScaleFactor(
    totalServings: Double,
    cookedWeight: Double?,
    amount: Double,
    mode: RecipeScaleMode,
): Double? {
    if (amount <= 0.0) return null
    val divisor =
        when (mode) {
            RecipeScaleMode.Servings -> totalServings
            RecipeScaleMode.Grams -> cookedWeight ?: return null
        }
    if (divisor <= 0.0) return null
    return amount / divisor
}

fun scaleIngredients(
    ingredients: List<RecipeIngredient>,
    factor: Double,
): List<RecipeIngredient> =
    ingredients.map {
        it.copy(quantity = maxOf(floor(it.quantity * factor * 100.0 + 0.5) / 100.0, 0.01))
    }

fun scaleSourceIngredients(
    ingredients: List<RecipeIngredient>,
    factor: Double,
): List<RecipeIngredient> = scaleIngredients(ingredients.sortedBy { it.sortOrder }, factor)
