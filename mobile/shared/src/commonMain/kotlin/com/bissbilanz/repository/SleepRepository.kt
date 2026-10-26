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
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

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
            cacheSleepEntries(entries, from, to)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun createEntry(entry: SleepCreate): SleepEntry {
        val temp = sleepCreateToEntry(entry)
        withContext(Dispatchers.IO) { cacheSleepEntry(temp) }
        syncQueue.enqueue(SyncOperation.CreateSleep(json.encodeToString(entry), localId = temp.id))
        return temp
    }

    /** The server id a temp id got once its create uploaded (see `EntryRepository.resolveId`). */
    suspend fun resolveId(id: String): String = if (id.isTempId()) syncQueue.resolveId(id) else id

    suspend fun updateEntry(
        id: String,
        entry: SleepUpdate,
    ): SleepEntry {
        @Suppress("NAME_SHADOWING")
        val id = resolveId(id)
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
                withContext(Dispatchers.IO) { cacheSleepEntry(updated) }
                updated
            } else {
                SleepEntry(
                    id = id,
                    userId = "",
                    entryDate = entry.entryDate ?: "",
                    durationMinutes = entry.durationMinutes ?: 0,
                    quality = entry.quality ?: 0.0,
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
        if (id.isTempId()) {
            // The create finished uploading meanwhile: the edit belongs to the server record,
            // and the temp row written above must not linger next to it.
            if (!coalesceQueuedCreate(id, entry)) {
                val uploadedId = resolveId(id)
                if (uploadedId != id) {
                    withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteSleepEntry(id) }
                    return updateEntry(uploadedId, entry)
                }
            }
        } else {
            syncQueue.enqueue(SyncOperation.UpdateSleep(id, json.encodeToString(entry)))
        }
        return result
    }

    suspend fun deleteEntry(id: String) {
        @Suppress("NAME_SHADOWING")
        val id = resolveId(id)
        withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteSleepEntry(id) }
        if (id.isTempId()) {
            if (syncQueue.removeByAffected("sleep", id) == 0) {
                val uploadedId = resolveId(id)
                if (uploadedId != id) return deleteEntry(uploadedId)
            }
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
    ): Boolean =
        syncQueue.rewriteQueuedCreate("sleep", tempId) { op ->
            val create = op as? SyncOperation.CreateSleep ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<SleepCreate>(create.body) ?: return@rewriteQueuedCreate null
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
            create.copy(body = json.encodeToString(merged))
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

    private suspend fun cacheSleepEntries(
        entries: List<SleepEntry>,
        from: String?,
        to: String?,
    ) {
        // Rows with an un-uploaded write must survive: optimistic temp-id creates whose
        // upload is still queued, and rows carrying a queued update. A temp row that is
        // no longer pending was already swapped for its server record, so it goes.
        // Only the requested window is replaced; a ranged refresh must not truncate the
        // history outside it (the health import dedupes against that history and
        // would otherwise re-create those nights and hit 409 duplicates).
        val pendingIds = pendingSleepIds()
        val queries = db.userDataDatabaseQueries
        withContext(Dispatchers.IO) {
            queries.transaction {
                queries
                    .selectAllSleepEntries()
                    .executeAsList()
                    .filter { it.id !in pendingIds }
                    .filter { (from == null || it.entryDate >= from) && (to == null || it.entryDate <= to) }
                    .forEach { queries.deleteSleepEntry(it.id) }
                entries.forEach { entry -> if (entry.id !in pendingIds) cacheSleepEntry(entry) }
            }
            // SyncMeta lives in the cache database; written after the user-data commit.
            cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "sleep",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    /** Sleep-entry ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingSleepIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "sleep" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    private fun sleepCreateToEntry(entry: SleepCreate): SleepEntry =
        SleepEntry(
            id = newTempId(),
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
