package com.bissbilanz.repository

import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class EntryRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val healthSync: HealthSyncService,
) {
    private val _entries = MutableStateFlow<List<Entry>>(emptyList())
    val entries: StateFlow<List<Entry>> = _entries.asStateFlow()

    private var currentDate: String? = null

    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    suspend fun loadEntries(date: String) {
        currentDate = date
        try {
            val entries = api.getEntries(date)
            cacheEntries(date, entries)
            _entries.value = entries
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectEntriesByDate(date).executeAsList()
            if (cached.isNotEmpty()) {
                _entries.value = cached.map { json.decodeFromString<Entry>(it.jsonData) }
            } else {
                throw e
            }
        }
    }

    suspend fun createEntry(entry: EntryCreate): Entry {
        val created = api.createEntry(entry)
        currentDate?.let { loadEntries(it) }
        syncNutritionForCurrentDate()
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        val updated = api.updateEntry(id, entry)
        currentDate?.let { loadEntries(it) }
        syncNutritionForCurrentDate()
        return updated
    }

    suspend fun deleteEntry(id: String) {
        api.deleteEntry(id)
        db.bissbilanzDatabaseQueries.deleteEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
        syncNutritionForCurrentDate()
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): Int {
        val result = api.copyEntries(fromDate, toDate)
        loadEntries(toDate)
        syncNutritionForCurrentDate()
        return result.count
    }

    private suspend fun syncNutritionForCurrentDate() {
        val date = currentDate ?: return
        try {
            val totals = calculateTotals(_entries.value)
            healthSync.syncNutrition(date, totals)
        } catch (_: Exception) {
        }
    }

    private fun calculateTotals(entries: List<Entry>): MacroTotals {
        var calories = 0.0
        var protein = 0.0
        var carbs = 0.0
        var fat = 0.0
        var fiber = 0.0
        for (entry in entries) {
            val s = entry.servings
            val food = entry.food
            val recipe = entry.recipe
            if (food != null) {
                calories += food.calories * s
                protein += food.protein * s
                carbs += food.carbs * s
                fat += food.fat * s
                fiber += food.fiber * s
            } else if (recipe != null) {
                val servings = recipe.totalServings.coerceAtLeast(1.0)
                recipe.ingredients?.forEach { ing ->
                    val f = ing.food ?: return@forEach
                    val q = ing.quantity / servings
                    calories += f.calories * q * s
                    protein += f.protein * q * s
                    carbs += f.carbs * q * s
                    fat += f.fat * q * s
                    fiber += f.fiber * q * s
                }
            } else {
                calories += (entry.quickCalories ?: 0.0) * s
                protein += (entry.quickProtein ?: 0.0) * s
                carbs += (entry.quickCarbs ?: 0.0) * s
                fat += (entry.quickFat ?: 0.0) * s
                fiber += (entry.quickFiber ?: 0.0) * s
            }
        }
        return MacroTotals(calories, protein, carbs, fat, fiber)
    }

    private fun cacheEntries(
        date: String,
        entries: List<Entry>,
    ) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteEntriesByDate(date)
            entries.forEach { entry ->
                val foodName = entry.food?.name ?: entry.recipe?.name ?: entry.quickName
                val calories = entry.food?.calories ?: entry.quickCalories ?: 0.0
                val protein = entry.food?.protein ?: entry.quickProtein ?: 0.0
                val carbs = entry.food?.carbs ?: entry.quickCarbs ?: 0.0
                val fat = entry.food?.fat ?: entry.quickFat ?: 0.0
                val fiber = entry.food?.fiber ?: entry.quickFiber ?: 0.0
                db.bissbilanzDatabaseQueries.insertEntry(
                    id = entry.id,
                    date = entry.date,
                    mealType = entry.mealType,
                    servings = entry.servings,
                    foodId = entry.foodId,
                    recipeId = entry.recipeId,
                    foodName = foodName,
                    calories = calories,
                    protein = protein,
                    carbs = carbs,
                    fat = fat,
                    fiber = fiber,
                    jsonData = json.encodeToString(entry),
                )
            }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "entries:$date",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }
}
