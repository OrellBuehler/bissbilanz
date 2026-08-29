package com.bissbilanz.repository

import com.bissbilanz.model.Entry
import com.bissbilanz.userdata.UserDataDatabaseQueries
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Writes [entry] into the local entry cache, flattening the macro columns the day-log
 * and dashboard queries sort and sum on. Shared with the sync manager, which swaps an
 * uploaded temp-id row for the server record and has to produce an identical row.
 */
internal fun UserDataDatabaseQueries.cacheEntryRow(
    entry: Entry,
    json: Json,
) {
    insertEntry(
        id = entry.id,
        date = entry.date,
        mealType = entry.mealType,
        servings = entry.servings,
        foodId = entry.foodId,
        recipeId = entry.recipeId,
        foodName = entry.food?.name ?: entry.recipe?.name ?: entry.foodName ?: entry.quickName,
        calories = entry.food?.calories ?: entry.calories ?: entry.quickCalories ?: 0.0,
        protein = entry.food?.protein ?: entry.protein ?: entry.quickProtein ?: 0.0,
        carbs = entry.food?.carbs ?: entry.carbs ?: entry.quickCarbs ?: 0.0,
        fat = entry.food?.fat ?: entry.fat ?: entry.quickFat ?: 0.0,
        fiber = entry.food?.fiber ?: entry.fiber ?: entry.quickFiber ?: 0.0,
        jsonData = json.encodeToString(entry),
    )
}
