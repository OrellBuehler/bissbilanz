package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.model.SleepFoodCorrelationEntry
import com.bissbilanz.model.SleepUpdate
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
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
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
) {
    fun entries(): Flow<List<SleepEntry>> =
        db.bissbilanzDatabaseQueries
            .selectAllSleepEntries()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<SleepEntry>(it.jsonData) } }

    suspend fun refresh(
        from: String? = null,
        to: String? = null,
    ) {
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
        syncQueue.enqueue(SyncOperation.CreateSleep(json.encodeToString(entry)))
        return temp
    }

    suspend fun updateEntry(
        id: String,
        entry: SleepUpdate,
    ): SleepEntry {
        val cached = db.bissbilanzDatabaseQueries.selectAllSleepEntries().executeAsList()
        val existing = cached.mapNotNull { json.decodeOrNull<SleepEntry>(it.jsonData) }.find { it.id == id }
        val result =
            if (existing != null) {
                val updated =
                    existing.copy(
                        durationMinutes = entry.durationMinutes?.toDouble() ?: existing.durationMinutes,
                        quality = entry.quality?.toDouble() ?: existing.quality,
                        entryDate = entry.entryDate ?: existing.entryDate,
                        bedtime = entry.bedtime ?: existing.bedtime,
                        wakeTime = entry.wakeTime ?: existing.wakeTime,
                        wakeUps = entry.wakeUps?.toDouble() ?: existing.wakeUps,
                        notes = entry.notes ?: existing.notes,
                    )
                cacheSleepEntry(updated)
                updated
            } else {
                SleepEntry(
                    id = id,
                    userId = "",
                    entryDate = entry.entryDate ?: "",
                    durationMinutes = entry.durationMinutes?.toDouble() ?: 0.0,
                    quality = entry.quality?.toDouble() ?: 0.0,
                    bedtime = entry.bedtime,
                    wakeTime = entry.wakeTime,
                    wakeUps = entry.wakeUps?.toDouble(),
                    sleepLatencyMinutes = null,
                    deepSleepMinutes = null,
                    lightSleepMinutes = null,
                    remSleepMinutes = null,
                    source = null,
                    notes = entry.notes,
                )
            }
        syncQueue.enqueue(SyncOperation.UpdateSleep(id, json.encodeToString(entry)))
        return result
    }

    suspend fun deleteEntry(id: String) {
        db.bissbilanzDatabaseQueries.deleteSleepEntry(id)
        syncQueue.enqueue(SyncOperation.DeleteSleep(id))
    }

    suspend fun getSleepFoodCorrelation(
        startDate: String,
        endDate: String,
    ): List<SleepFoodCorrelationEntry> =
        try {
            api.getSleepFoodCorrelation(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            emptyList()
        }

    private fun cacheSleepEntry(entry: SleepEntry) {
        db.bissbilanzDatabaseQueries.insertSleepEntry(
            id = entry.id,
            entryDate = entry.entryDate,
            durationMinutes = entry.durationMinutes,
            quality = entry.quality,
            loggedAt = entry.loggedAt,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun cacheSleepEntries(entries: List<SleepEntry>) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteAllSleepEntries()
            entries.forEach { entry -> cacheSleepEntry(entry) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "sleep",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun sleepCreateToEntry(entry: SleepCreate): SleepEntry =
        SleepEntry(
            id = "temp_${Uuid.random()}",
            userId = "",
            entryDate = entry.entryDate,
            durationMinutes = entry.durationMinutes.toDouble(),
            quality = entry.quality.toDouble(),
            bedtime = entry.bedtime,
            wakeTime = entry.wakeTime,
            wakeUps = entry.wakeUps?.toDouble(),
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
