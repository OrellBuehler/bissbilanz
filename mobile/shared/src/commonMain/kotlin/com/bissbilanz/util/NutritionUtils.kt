package com.bissbilanz.util

import com.bissbilanz.model.Entry
import com.bissbilanz.model.MacroTotals

fun Entry.resolvedName(): String = food?.name ?: recipe?.name ?: foodName ?: quickName ?: "Unknown"

fun Entry.resolvedCalories(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.calories * servings
        recipe != null -> {
            val totalServings = recipe.totalServings.coerceAtLeast(1.0)
            (recipe.ingredients ?: emptyList()).sumOf { ing ->
                val f = ing.food ?: return@sumOf 0.0
                f.calories * (ing.quantity / totalServings) * servings
            }
        }
        calories != null -> calories * servings
        else -> (quickCalories ?: 0.0) * servings
    }
}

fun Entry.resolvedProtein(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.protein * servings
        recipe != null -> {
            val totalServings = recipe.totalServings.coerceAtLeast(1.0)
            (recipe.ingredients ?: emptyList()).sumOf { ing ->
                val f = ing.food ?: return@sumOf 0.0
                f.protein * (ing.quantity / totalServings) * servings
            }
        }
        protein != null -> protein * servings
        else -> (quickProtein ?: 0.0) * servings
    }
}

fun Entry.resolvedCarbs(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.carbs * servings
        recipe != null -> {
            val totalServings = recipe.totalServings.coerceAtLeast(1.0)
            (recipe.ingredients ?: emptyList()).sumOf { ing ->
                val f = ing.food ?: return@sumOf 0.0
                f.carbs * (ing.quantity / totalServings) * servings
            }
        }
        carbs != null -> carbs * servings
        else -> (quickCarbs ?: 0.0) * servings
    }
}

fun Entry.resolvedFat(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.fat * servings
        recipe != null -> {
            val totalServings = recipe.totalServings.coerceAtLeast(1.0)
            (recipe.ingredients ?: emptyList()).sumOf { ing ->
                val f = ing.food ?: return@sumOf 0.0
                f.fat * (ing.quantity / totalServings) * servings
            }
        }
        fat != null -> fat * servings
        else -> (quickFat ?: 0.0) * servings
    }
}

fun Entry.resolvedFiber(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.fiber * servings
        recipe != null -> {
            val totalServings = recipe.totalServings.coerceAtLeast(1.0)
            (recipe.ingredients ?: emptyList()).sumOf { ing ->
                val f = ing.food ?: return@sumOf 0.0
                f.fiber * (ing.quantity / totalServings) * servings
            }
        }
        fiber != null -> fiber * servings
        else -> (quickFiber ?: 0.0) * servings
    }
}

fun List<Entry>.totalMacros(): MacroTotals =
    MacroTotals(
        calories = sumOf { it.resolvedCalories() },
        protein = sumOf { it.resolvedProtein() },
        carbs = sumOf { it.resolvedCarbs() },
        fat = sumOf { it.resolvedFat() },
        fiber = sumOf { it.resolvedFiber() },
    )
