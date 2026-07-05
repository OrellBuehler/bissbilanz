package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.HealthSyncService
import com.bissbilanz.analytics.WeightChartInput
import com.bissbilanz.analytics.weightMovingAverage
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.WeightCreate
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.api.generated.model.WeightTrendEntry
import com.bissbilanz.api.generated.model.WeightUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class WeightRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val healthSync: HealthSyncService,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    var onWeightChanged: (suspend () -> Unit)? = null

    fun entries(): Flow<List<WeightEntry>> =
        db.userDataDatabaseQueries
            .selectAllWeightEntries()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<WeightEntry>(it.jsonData) } }

    suspend fun refresh(limit: Int = 30) {
        if (appModeManager.isLocal) return
        val entries = api.getWeightEntries(limit)
        cacheWeightEntries(entries)
    }

    suspend fun createEntry(entry: WeightCreate): WeightEntry {
        val temp = weightCreateToEntry(entry)
        cacheWeightEntry(temp)
        try {
            healthSync.syncWeight(listOf(temp))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
        syncQueue.enqueue(SyncOperation.CreateWeight(json.encodeToString(entry), localId = temp.id))
        onWeightChanged?.invoke()
        return temp
    }

    suspend fun updateEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        val cached = db.userDataDatabaseQueries.selectAllWeightEntries().executeAsList()
        val existing = cached.mapNotNull { json.decodeOrNull<WeightEntry>(it.jsonData) }.find { it.id == id }
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
                    notes = entry.notes,
                )
            }
        try {
            healthSync.syncWeight(listOf(result))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
        if (id.startsWith("temp_")) {
            coalesceQueuedCreate(id, entry)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateWeight(id, json.encodeToString(entry)))
        }
        onWeightChanged?.invoke()
        return result
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id weight entry so the
     * eventual upload carries the edited values. If the create has already been drained
     * (no queued op found), the update is skipped — the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: WeightUpdate,
    ) {
        for (req in syncQueue.findByAffected("weight", tempId)) {
            val create = req.operation as? SyncOperation.CreateWeight ?: continue
            val body = json.decodeOrNull<WeightCreate>(create.body) ?: continue
            val merged =
                body.copy(
                    weightKg = update.weightKg ?: body.weightKg,
                    entryDate = update.entryDate ?: body.entryDate,
                    notes = update.notes ?: body.notes,
                )
            syncQueue.replaceOperation(req.id, create.copy(body = json.encodeToString(merged)))
        }
    }

    suspend fun getTrend(
        from: String,
        to: String,
    ): List<WeightTrendEntry> {
        if (appModeManager.isLocal) return trendFromCache(from, to)
        return try {
            api.getWeightTrend(from, to)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            trendFromCache(from, to)
        }
    }

    private fun trendFromCache(
        from: String,
        to: String,
    ): List<WeightTrendEntry> =
        db.userDataDatabaseQueries
            .selectAllWeightEntries()
            .executeAsList()
            .mapNotNull { json.decodeOrNull<WeightEntry>(it.jsonData) }
            .filter { it.entryDate in from..to }
            .map { WeightChartInput(date = it.entryDate, weightKg = it.weightKg, loggedAt = it.loggedAt) }
            .let(::weightMovingAverage)
            .map { WeightTrendEntry(entryDate = it.date, weightKg = it.weightKg, movingAvg = it.movingAvg) }

    suspend fun deleteEntry(id: String) {
        db.userDataDatabaseQueries.deleteWeightEntry(id)
        if (id.startsWith("temp_")) {
            syncQueue.removeByAffected("weight", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteWeight(id))
        }
        onWeightChanged?.invoke()
    }

    private fun cacheWeightEntry(entry: WeightEntry) {
        db.userDataDatabaseQueries.insertWeightEntry(
            id = entry.id,
            entryDate = entry.entryDate,
            weightKg = entry.weightKg,
            loggedAt = entry.loggedAt,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun cacheWeightEntries(entries: List<WeightEntry>) {
        db.userDataDatabaseQueries.transaction {
            db.userDataDatabaseQueries.deleteAllWeightEntries()
            entries.forEach { entry -> cacheWeightEntry(entry) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "weight",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun weightCreateToEntry(entry: WeightCreate): WeightEntry =
        WeightEntry(
            id = "temp_${Uuid.random()}",
            userId = "",
            weightKg = entry.weightKg,
            entryDate = entry.entryDate,
            loggedAt = Clock.System.now().toString(),
            notes = entry.notes,
            createdAt = Clock.System.now().toString(),
        )
}
