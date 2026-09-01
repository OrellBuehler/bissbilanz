package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
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
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

class WeightRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    var onWeightChanged: (suspend () -> Unit)? = null

    /**
     * Fired after a server refresh replaced the cached entries. Weights logged
     * outside this device (web, MCP, iOS) only arrive through refresh, so this is
     * where the Health Connect export, the weight widget and the watch state catch
     * them — [onWeightChanged] only covers mutations made in the app itself.
     * Mirrors [com.bissbilanz.repository.EntryRepository.onEntriesRefreshed].
     */
    var onWeightRefreshed: (suspend () -> Unit)? = null

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
        onWeightRefreshed?.invoke()
    }

    suspend fun createEntry(entry: WeightCreate): WeightEntry {
        val temp = weightCreateToEntry(entry)
        cacheWeightEntry(temp)
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
        if (id.isTempId()) {
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
        syncQueue.rewriteQueuedCreate("weight", tempId) { op ->
            val create = op as? SyncOperation.CreateWeight ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<WeightCreate>(create.body) ?: return@rewriteQueuedCreate null
            val merged =
                body.copy(
                    weightKg = update.weightKg ?: body.weightKg,
                    entryDate = update.entryDate ?: body.entryDate,
                    notes = update.notes ?: body.notes,
                )
            create.copy(body = json.encodeToString(merged))
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
        if (id.isTempId()) {
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

    private suspend fun cacheWeightEntries(entries: List<WeightEntry>) {
        val pendingIds = pendingWeightIds()
        val queries = db.userDataDatabaseQueries
        // Keep optimistic temp-id creates whose upload is still queued or in flight,
        // and rows carrying a queued update (a queued delete already removed its row).
        // A forced refresh right after a weight create/edit/delete (the UI calls
        // refresh() on save) races the async sync-queue upload; without this, the
        // still-stale server list would revert the edit, drop the just-logged entry,
        // or resurrect a deleted one until the next manual refresh. A temp row that is
        // no longer in `pendingIds` has nothing left to upload — the sync manager
        // already swapped it for the server record — so it must not be kept, or the
        // list shows the same weight twice.
        val preserved =
            queries
                .selectAllWeightEntries()
                .executeAsList()
                .filter { it.id in pendingIds }
                .mapNotNull { json.decodeOrNull<WeightEntry>(it.jsonData) }
        queries.transaction {
            queries.deleteAllWeightEntries()
            entries.forEach { entry -> if (entry.id !in pendingIds) cacheWeightEntry(entry) }
            preserved.forEach { cacheWeightEntry(it) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "weight",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    /** Weight-entry ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingWeightIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "weight" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    private fun weightCreateToEntry(entry: WeightCreate): WeightEntry =
        WeightEntry(
            id = newTempId(),
            userId = "",
            weightKg = entry.weightKg,
            entryDate = entry.entryDate,
            loggedAt = Clock.System.now().toString(),
            notes = entry.notes,
            createdAt = Clock.System.now().toString(),
        )
}
