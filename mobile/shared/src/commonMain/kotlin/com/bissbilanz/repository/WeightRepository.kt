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

class WeightRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val healthSync: HealthSyncService,
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
) {
    private val _entries = MutableStateFlow<List<WeightEntry>>(emptyList())
    val entries: StateFlow<List<WeightEntry>> = _entries.asStateFlow()

    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    suspend fun loadEntries(limit: Int = 30) {
        try {
            val entries = api.getWeightEntries(limit)
            cacheWeightEntries(entries)
            _entries.value = entries
        } catch (e: Exception) {
            val cached =
                db.bissbilanzDatabaseQueries.selectWeightEntriesLimited(limit.toLong())
                    .executeAsList()
            if (cached.isNotEmpty()) {
                _entries.value = cached.map { json.decodeFromString<WeightEntry>(it.jsonData) }
            } else {
                throw e
            }
        }
    }

    suspend fun createEntry(entry: WeightCreate): WeightEntry {
        if (!connectivity.isOnline.value) {
            val url = "/api/weight"
            val body = json.encodeToString(entry)
            val meta = urlToMeta(url)
            syncQueue.enqueue("POST", url, body, meta.affectedTable, meta.affectedId)
            val temp = weightCreateToEntry(entry)
            cacheWeightEntry(temp)
            _entries.value = listOf(temp) + _entries.value
            return temp
        }
        val created = api.createWeightEntry(entry)
        cacheWeightEntry(created)
        loadEntries()
        try {
            healthSync.syncWeight(listOf(created))
        } catch (_: Exception) {
        }
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        if (!connectivity.isOnline.value) {
            val url = "/api/weight/$id"
            val body = json.encodeToString(entry)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            val existing = _entries.value.find { it.id == id }
            if (existing != null) {
                val updated =
                    existing.copy(
                        weightKg = entry.weightKg ?: existing.weightKg,
                        entryDate = entry.entryDate ?: existing.entryDate,
                        notes = entry.notes ?: existing.notes,
                    )
                cacheWeightEntry(updated)
                _entries.value = _entries.value.map { if (it.id == id) updated else it }
                return updated
            }
            return existing ?: WeightEntry(
                id = id,
                userId = "",
                weightKg = entry.weightKg ?: 0.0,
                entryDate = entry.entryDate ?: "",
            )
        }
        val updated = api.updateWeightEntry(id, entry)
        cacheWeightEntry(updated)
        loadEntries()
        try {
            healthSync.syncWeight(listOf(updated))
        } catch (_: Exception) {
        }
        return updated
    }

    suspend fun deleteEntry(id: String) {
        if (!connectivity.isOnline.value) {
            val url = "/api/weight/$id"
            val meta = urlToMeta(url)
            syncQueue.enqueue("DELETE", url, "", meta.affectedTable, meta.affectedId)
        } else {
            api.deleteWeightEntry(id)
        }
        db.bissbilanzDatabaseQueries.deleteWeightEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
    }

    private fun cacheWeightEntry(entry: WeightEntry) {
        db.bissbilanzDatabaseQueries.insertWeightEntry(
            id = entry.id,
            entryDate = entry.entryDate,
            weightKg = entry.weightKg,
            loggedAt = entry.loggedAt,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun cacheWeightEntries(entries: List<WeightEntry>) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteAllWeightEntries()
            entries.forEach { entry -> cacheWeightEntry(entry) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "weight",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    private fun weightCreateToEntry(entry: WeightCreate): WeightEntry =
        WeightEntry(
            id = "temp_${Clock.System.now().toEpochMilliseconds()}",
            userId = "",
            weightKg = entry.weightKg,
            entryDate = entry.entryDate,
            loggedAt = Clock.System.now().toString(),
            notes = entry.notes,
            createdAt = Clock.System.now().toString(),
        )
}
