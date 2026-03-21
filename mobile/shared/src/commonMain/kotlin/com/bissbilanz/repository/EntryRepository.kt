package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.totalMacros
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class EntryRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val healthSync: HealthSyncService,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
) {
    private var currentDate: String? = null
    var onEntryChanged: (suspend () -> Unit)? = null

    fun entriesByDate(date: String): Flow<List<Entry>> =
        db.bissbilanzDatabaseQueries
            .selectEntriesByDate(date)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) } }

    suspend fun entriesByDateOnce(date: String): List<Entry> =
        db.bissbilanzDatabaseQueries
            .selectEntriesByDate(date)
            .executeAsList()
            .mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }

    suspend fun refresh(date: String) {
        currentDate = date
        val entries = api.getEntries(date)
        cacheEntries(date, entries)
    }

    suspend fun createEntry(
        entry: EntryCreate,
        food: Food? = null,
        recipe: Recipe? = null,
    ): Entry {
        val tempEntry = entryCreateToEntry(entry, food, recipe)
        cacheEntry(tempEntry)
        syncNutritionForCurrentDate()
        syncQueue.enqueue(SyncOperation.CreateEntry(json.encodeToString(entry)))
        onEntryChanged?.invoke()
        return tempEntry
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        val cached =
            db.bissbilanzDatabaseQueries
                .selectEntriesByDate(currentDate ?: entry.date ?: "")
                .executeAsList()
        val existing = cached.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }.find { it.id == id }
        val result =
            if (existing != null) {
                val updated = applyUpdate(existing, entry)
                cacheEntry(updated)
                updated
            } else {
                Entry(
                    id = id,
                    userId = "",
                    date = entry.date ?: currentDate ?: "",
                    mealType = entry.mealType ?: "",
                    servings = entry.servings ?: 1.0,
                )
            }
        syncNutritionForCurrentDate()
        if (!id.startsWith("temp_")) {
            syncQueue.enqueue(SyncOperation.UpdateEntry(id, json.encodeToString(entry)))
        }
        onEntryChanged?.invoke()
        return result
    }

    suspend fun deleteEntry(id: String) {
        db.bissbilanzDatabaseQueries.deleteEntry(id)
        syncNutritionForCurrentDate()
        if (!id.startsWith("temp_")) {
            syncQueue.enqueue(SyncOperation.DeleteEntry(id))
        }
        onEntryChanged?.invoke()
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): Int {
        val source = entriesByDateOnce(fromDate)
        var count = 0
        for (entry in source) {
            val create =
                EntryCreate(
                    mealType = entry.mealType,
                    servings = entry.servings,
                    date = toDate,
                    foodId = entry.foodId,
                    recipeId = entry.recipeId,
                    notes = entry.notes,
                    quickName = entry.quickName,
                    quickCalories = entry.quickCalories,
                    quickProtein = entry.quickProtein,
                    quickCarbs = entry.quickCarbs,
                    quickFat = entry.quickFat,
                    quickFiber = entry.quickFiber,
                    eatenAt = entry.eatenAt,
                )
            createEntry(create, food = entry.food, recipe = entry.recipe)
            count++
        }
        return count
    }

    private suspend fun syncNutritionForCurrentDate() {
        val date = currentDate ?: return
        try {
            val cached = db.bissbilanzDatabaseQueries.selectEntriesByDate(date).executeAsList()
            val entries = cached.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }
            val totals = entries.totalMacros()
            healthSync.syncNutrition(date, totals)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private fun cacheEntry(entry: Entry) {
        val foodName = entry.food?.name ?: entry.recipe?.name ?: entry.foodName ?: entry.quickName
        val calories = entry.food?.calories ?: entry.calories ?: entry.quickCalories ?: 0.0
        val protein = entry.food?.protein ?: entry.protein ?: entry.quickProtein ?: 0.0
        val carbs = entry.food?.carbs ?: entry.carbs ?: entry.quickCarbs ?: 0.0
        val fat = entry.food?.fat ?: entry.fat ?: entry.quickFat ?: 0.0
        val fiber = entry.food?.fiber ?: entry.fiber ?: entry.quickFiber ?: 0.0
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
            entries.forEach { entry -> cacheEntry(entry.copy(date = date)) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "entries:$date",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun entryCreateToEntry(
        entry: EntryCreate,
        food: Food? = null,
        recipe: Recipe? = null,
    ): Entry =
        Entry(
            id = "temp_${Uuid.random()}",
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
            food = food,
            recipe = recipe,
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
