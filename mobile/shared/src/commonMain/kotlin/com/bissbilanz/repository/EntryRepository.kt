package com.bissbilanz.repository

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
                _entries.value = cached.map { json.decodeFromString<Entry>(it.json_) }
            } else {
                throw e
            }
        }
    }

    suspend fun createEntry(entry: EntryCreate): Entry {
        val created = api.createEntry(entry)
        currentDate?.let { loadEntries(it) }
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        val updated = api.updateEntry(id, entry)
        currentDate?.let { loadEntries(it) }
        return updated
    }

    suspend fun deleteEntry(id: String) {
        api.deleteEntry(id)
        db.bissbilanzDatabaseQueries.deleteEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
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
                    json_ = json.encodeToString(entry),
                )
            }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "entries:$date",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }
}
