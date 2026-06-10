package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepFoodCorrelationEntry
import com.bissbilanz.api.generated.model.SleepUpdate
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

class SleepRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    fun entries(): Flow<List<SleepEntry>> =
        db.userDataDatabaseQueries
            .selectAllSleepEntries()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<SleepEntry>(it.jsonData) } }

    suspend fun refresh(
        from: String? = null,
        to: String? = null,
    ) {
        if (appModeManager.isLocal) return
        try {
            val entries = api.getSleepEntries(from, to)
            cacheSleepEntries(entries)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun createEntry(entry: SleepCreate): SleepEntry {
        val temp = sleepCreateToEntry(entry)
        cacheSleepEntry(temp)
        syncQueue.enqueue(SyncOperation.CreateSleep(json.encodeToString(entry), localId = temp.id))
        return temp
    }

    suspend fun updateEntry(
        id: String,
        entry: SleepUpdate,
    ): SleepEntry {
        val cached = db.userDataDatabaseQueries.selectAllSleepEntries().executeAsList()
        val existing = cached.mapNotNull { json.decodeOrNull<SleepEntry>(it.jsonData) }.find { it.id == id }
        val result =
            if (existing != null) {
                val updated =
                    existing.copy(
                        durationMinutes = entry.durationMinutes ?: existing.durationMinutes,
                        quality = entry.quality ?: existing.quality,
                        entryDate = entry.entryDate ?: existing.entryDate,
                        bedtime = entry.bedtime ?: existing.bedtime,
                        wakeTime = entry.wakeTime ?: existing.wakeTime,
                        wakeUps = entry.wakeUps ?: existing.wakeUps,
                        notes = entry.notes ?: existing.notes,
                    )
                cacheSleepEntry(updated)
                updated
            } else {
                SleepEntry(
                    id = id,
                    userId = "",
                    entryDate = entry.entryDate ?: "",
                    durationMinutes = entry.durationMinutes ?: 0,
                    quality = entry.quality ?: 0,
                    bedtime = entry.bedtime,
                    wakeTime = entry.wakeTime,
                    wakeUps = entry.wakeUps,
                    sleepLatencyMinutes = null,
                    deepSleepMinutes = null,
                    lightSleepMinutes = null,
                    remSleepMinutes = null,
                    source = null,
                    notes = entry.notes,
                )
            }
        if (id.startsWith("temp_")) {
            coalesceQueuedCreate(id, entry)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateSleep(id, json.encodeToString(entry)))
        }
        return result
    }

    suspend fun deleteEntry(id: String) {
        db.userDataDatabaseQueries.deleteSleepEntry(id)
        if (id.startsWith("temp_")) {
            syncQueue.removeByAffected("sleep", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteSleep(id))
        }
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id sleep entry so the
     * eventual upload carries the edited values. If the create has already been drained
     * (no queued op found), the update is skipped — the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: SleepUpdate,
    ) {
        for (req in syncQueue.findByAffected("sleep", tempId)) {
            val create = req.operation as? SyncOperation.CreateSleep ?: continue
            val body = json.decodeOrNull<SleepCreate>(create.body) ?: continue
            val merged =
                body.copy(
                    durationMinutes = update.durationMinutes ?: body.durationMinutes,
                    quality = update.quality ?: body.quality,
                    entryDate = update.entryDate ?: body.entryDate,
                    bedtime = update.bedtime ?: body.bedtime,
                    wakeTime = update.wakeTime ?: body.wakeTime,
                    wakeUps = update.wakeUps ?: body.wakeUps,
                    notes = update.notes ?: body.notes,
                )
            syncQueue.replaceOperation(req.id, create.copy(body = json.encodeToString(merged)))
        }
    }

    /**
     * Returns a single sleep entry by [id]. Checks the local cache first; if not
     * present, performs a range refresh and looks again. Returns null when the
     * entry cannot be found on the server either.
     */
    suspend fun getEntry(id: String): SleepEntry? {
        findInCache(id)?.let { return it }
        refresh()
        return findInCache(id)
    }

    private fun findInCache(id: String): SleepEntry? =
        db.userDataDatabaseQueries
            .selectAllSleepEntries()
            .executeAsList()
            .asSequence()
            .mapNotNull { json.decodeOrNull<SleepEntry>(it.jsonData) }
            .firstOrNull { it.id == id }

    suspend fun getSleepFoodCorrelation(
        startDate: String,
        endDate: String,
    ): List<SleepFoodCorrelationEntry> {
        // Server-side analytics; the UI hides this in Local mode.
        if (appModeManager.isLocal) return emptyList()
        return try {
            api.getSleepFoodCorrelation(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            emptyList()
        }
    }

    private fun cacheSleepEntry(entry: SleepEntry) {
        db.userDataDatabaseQueries.insertSleepEntry(
            id = entry.id,
            entryDate = entry.entryDate,
            durationMinutes = entry.durationMinutes.toLong(),
            quality = entry.quality.toLong(),
            loggedAt = entry.loggedAt,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun cacheSleepEntries(entries: List<SleepEntry>) {
        db.userDataDatabaseQueries.transaction {
            db.userDataDatabaseQueries.deleteAllSleepEntries()
            entries.forEach { entry -> cacheSleepEntry(entry) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "sleep",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun sleepCreateToEntry(entry: SleepCreate): SleepEntry =
        SleepEntry(
            id = "temp_${Uuid.random()}",
            userId = "",
            entryDate = entry.entryDate,
            durationMinutes = entry.durationMinutes,
            quality = entry.quality,
            bedtime = entry.bedtime,
            wakeTime = entry.wakeTime,
            wakeUps = entry.wakeUps,
            sleepLatencyMinutes = null,
            deepSleepMinutes = null,
            lightSleepMinutes = null,
            remSleepMinutes = null,
            source = null,
            notes = entry.notes,
            loggedAt = Clock.System.now().toString(),
            createdAt = Clock.System.now().toString(),
        )
}
