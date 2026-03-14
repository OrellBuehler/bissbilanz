package com.bissbilanz.repository

import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
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
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
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
        if (!connectivity.isOnline.value) {
            val url = "/api/entries"
            val body = json.encodeToString(entry)
            val meta = urlToMeta(url)
            syncQueue.enqueue("POST", url, body, meta.affectedTable, meta.affectedId)
            val tempEntry = entryCreateToEntry(entry)
            cacheEntry(tempEntry)
            _entries.value = _entries.value + tempEntry
            syncNutritionForCurrentDate()
            return tempEntry
        }
        val created = api.createEntry(entry)
        currentDate?.let { loadEntries(it) }
        syncNutritionForCurrentDate()
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        if (!connectivity.isOnline.value) {
            val url = "/api/entries/$id"
            val body = json.encodeToString(entry)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            // Update local entry optimistically
            val existing = _entries.value.find { it.id == id }
            if (existing != null) {
                val updated = applyUpdate(existing, entry)
                cacheEntry(updated)
                _entries.value = _entries.value.map { if (it.id == id) updated else it }
            }
            syncNutritionForCurrentDate()
            return existing ?: Entry(
                id = id,
                userId = "",
                date = entry.date ?: currentDate ?: "",
                mealType = entry.mealType ?: "",
                servings = entry.servings ?: 1.0,
            )
        }
        val updated = api.updateEntry(id, entry)
        currentDate?.let { loadEntries(it) }
        syncNutritionForCurrentDate()
        return updated
    }

    suspend fun deleteEntry(id: String) {
        if (!connectivity.isOnline.value) {
            val url = "/api/entries/$id"
            val meta = urlToMeta(url)
            syncQueue.enqueue("DELETE", url, "", meta.affectedTable, meta.affectedId)
        } else {
            api.deleteEntry(id)
        }
        db.bissbilanzDatabaseQueries.deleteEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
        syncNutritionForCurrentDate()
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): Int {
        // Copy requires server — no offline support (same as PWA)
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

    private fun cacheEntry(entry: Entry) {
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

    private fun cacheEntries(
        date: String,
        entries: List<Entry>,
    ) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteEntriesByDate(date)
            entries.forEach { entry -> cacheEntry(entry) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "entries:$date",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    private fun entryCreateToEntry(entry: EntryCreate): Entry =
        Entry(
            id = "temp_${Clock.System.now().toEpochMilliseconds()}",
            userId = "",
            foodId = entry.foodId,
            recipeId = entry.recipeId,
            date = entry.date,
            mealType = entry.mealType,
            servings = entry.servings,
            notes = entry.notes,
            quickName = entry.quickName,
            quickCalories = entry.quickCalories,
            quickProtein = entry.quickProtein,
            quickCarbs = entry.quickCarbs,
            quickFat = entry.quickFat,
            quickFiber = entry.quickFiber,
            eatenAt = entry.eatenAt,
            createdAt = Clock.System.now().toString(),
        )

    private fun applyUpdate(
        existing: Entry,
        update: EntryUpdate,
    ): Entry =
        existing.copy(
            foodId = update.foodId ?: existing.foodId,
            recipeId = update.recipeId ?: existing.recipeId,
            mealType = update.mealType ?: existing.mealType,
            servings = update.servings ?: existing.servings,
            date = update.date ?: existing.date,
            notes = update.notes ?: existing.notes,
            quickName = update.quickName ?: existing.quickName,
            quickCalories = update.quickCalories ?: existing.quickCalories,
            quickProtein = update.quickProtein ?: existing.quickProtein,
            quickCarbs = update.quickCarbs ?: existing.quickCarbs,
            quickFat = update.quickFat ?: existing.quickFat,
            quickFiber = update.quickFiber ?: existing.quickFiber,
            eatenAt = update.eatenAt ?: existing.eatenAt,
        )
}
