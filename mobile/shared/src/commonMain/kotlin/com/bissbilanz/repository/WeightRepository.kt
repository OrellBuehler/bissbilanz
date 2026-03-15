package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class WeightRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val healthSync: HealthSyncService,
    private val syncQueue: SyncQueue,
    private val json: Json,
) {
    fun entries(): Flow<List<WeightEntry>> =
        db.bissbilanzDatabaseQueries
            .selectAllWeightEntries()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { json.decodeFromString<WeightEntry>(it.jsonData) } }

    suspend fun refresh(limit: Int = 30) {
        try {
            val entries = api.getWeightEntries(limit)
            cacheWeightEntries(entries)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun createEntry(entry: WeightCreate): WeightEntry {
        val temp = weightCreateToEntry(entry)
        cacheWeightEntry(temp)
        try {
            healthSync.syncWeight(listOf(temp))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
        val url = "/api/weight"
        val body = json.encodeToString(entry)
        val meta = urlToMeta(url)
        syncQueue.enqueue("POST", url, body, meta.affectedTable, meta.affectedId)
        return temp
    }

    suspend fun updateEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        val cached = db.bissbilanzDatabaseQueries.selectAllWeightEntries().executeAsList()
        val existing = cached.map { json.decodeFromString<WeightEntry>(it.jsonData) }.find { it.id == id }
        val result =
            if (existing != null) {
                val updated =
                    existing.copy(
                        weightKg = entry.weightKg ?: existing.weightKg,
                        entryDate = entry.entryDate ?: existing.entryDate,
                        notes = entry.notes ?: existing.notes,
                    )
                cacheWeightEntry(updated)
                updated
            } else {
                WeightEntry(
                    id = id,
                    userId = "",
                    weightKg = entry.weightKg ?: 0.0,
                    entryDate = entry.entryDate ?: "",
                )
            }
        try {
            healthSync.syncWeight(listOf(result))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
        val url = "/api/weight/$id"
        val body = json.encodeToString(entry)
        val meta = urlToMeta(url)
        syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
        return result
    }

    suspend fun deleteEntry(id: String) {
        db.bissbilanzDatabaseQueries.deleteWeightEntry(id)
        val url = "/api/weight/$id"
        val meta = urlToMeta(url)
        syncQueue.enqueue("DELETE", url, "", meta.affectedTable, meta.affectedId)
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
