package com.bissbilanz.util

import com.bissbilanz.model.Entry
import com.bissbilanz.model.MacroTotals

fun Entry.resolvedName(): String = food?.name ?: recipe?.name ?: foodName ?: quickName ?: "Unknown"

fun Entry.resolvedCalories(): Double {
    val food = food
    return when {
        food != null -> food.calories * servings
        calories != null -> calories * servings
        else -> (quickCalories ?: 0.0) * servings
    }
}

fun Entry.resolvedProtein(): Double {
    val food = food
    return when {
        food != null -> food.protein * servings
        protein != null -> protein * servings
        else -> (quickProtein ?: 0.0) * servings
    }
}

fun Entry.resolvedCarbs(): Double {
    val food = food
    return when {
        food != null -> food.carbs * servings
        carbs != null -> carbs * servings
        else -> (quickCarbs ?: 0.0) * servings
    }
}

fun Entry.resolvedFat(): Double {
    val food = food
    return when {
        food != null -> food.fat * servings
        fat != null -> fat * servings
        else -> (quickFat ?: 0.0) * servings
    }
}

fun Entry.resolvedFiber(): Double {
    val food = food
    return when {
        food != null -> food.fiber * servings
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
