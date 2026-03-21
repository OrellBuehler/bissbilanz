package com.bissbilanz.util

import com.bissbilanz.model.Entry
import com.bissbilanz.model.MacroTotals

object DefaultGoals {
    const val CALORIES = 2000.0
    const val PROTEIN = 150.0
    const val CARBS = 250.0
    const val FAT = 65.0
    const val FIBER = 30.0
}

fun Entry.resolvedName(): String = food?.name ?: recipe?.name ?: foodName ?: quickName ?: "Unknown"

fun Entry.resolvedCalories(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.calories * servings
        recipe != null -> recipe.calories * servings
        calories != null -> calories * servings
        else -> (quickCalories ?: 0.0) * servings
    }
}

fun Entry.resolvedProtein(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.protein * servings
        recipe != null -> recipe.protein * servings
        protein != null -> protein * servings
        else -> (quickProtein ?: 0.0) * servings
    }
}

fun Entry.resolvedCarbs(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.carbs * servings
        recipe != null -> recipe.carbs * servings
        carbs != null -> carbs * servings
        else -> (quickCarbs ?: 0.0) * servings
    }
}

fun Entry.resolvedFat(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.fat * servings
        recipe != null -> recipe.fat * servings
        fat != null -> fat * servings
        else -> (quickFat ?: 0.0) * servings
    }
}

fun Entry.resolvedFiber(): Double {
    val food = food
    val recipe = recipe
    return when {
        food != null -> food.fiber * servings
        recipe != null -> recipe.fiber * servings
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
