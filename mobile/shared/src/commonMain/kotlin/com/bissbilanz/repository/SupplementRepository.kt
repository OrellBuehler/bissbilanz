package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.SupplementHistoryEntry
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

// The server-side SupplementLog no longer carries a row id — it's derived from
// food_entries keyed by (supplementId, date). The local SQLDelight cache still
// wants a primary key, so we synthesize one from the natural key.
private fun cacheKeyFor(
    supplementId: String,
    date: String,
): String = "$supplementId-$date"

class SupplementRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
) {
    fun supplements(): Flow<List<Supplement>> =
        db.bissbilanzDatabaseQueries
            .selectActiveSupplements()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) } }

    suspend fun refresh() {
        val supplements = api.getSupplements()
        cacheSupplements(supplements)
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        val temp = supplementCreateToSupplement(supplement)
        cacheSupplement(temp)
        syncQueue.enqueue(SyncOperation.CreateSupplement(json.encodeToString(supplement)))
        return temp
    }

    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
    ): Supplement {
        val temp = supplementCreateToSupplement(supplement, id)
        cacheSupplement(temp)
        syncQueue.enqueue(SyncOperation.UpdateSupplement(id, json.encodeToString(supplement)))
        return temp
    }

    suspend fun deleteSupplement(id: String) {
        db.bissbilanzDatabaseQueries.deleteSupplement(id)
        syncQueue.enqueue(SyncOperation.DeleteSupplement(id))
    }

    suspend fun getChecklist(date: String): List<SupplementLog> =
        try {
            val checklist = api.getSupplementChecklist(date)
            val logs =
                checklist.filter { it.taken }.map { item ->
                    SupplementLog(
                        supplementId = item.supplement.id,
                        date = date,
                        takenAt = item.takenAt ?: "",
                        entryIds = emptyList(),
                    )
                }
            logs.forEach { log ->
                db.bissbilanzDatabaseQueries.insertSupplementLog(
                    id = cacheKeyFor(log.supplementId, log.date),
                    supplementId = log.supplementId,
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
            logs
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cachedLogs =
                db.bissbilanzDatabaseQueries.selectSupplementLogsByDate(date).executeAsList()
            cachedLogs.map { log ->
                SupplementLog(
                    supplementId = log.supplementId,
                    date = log.date,
                    takenAt = log.takenAt,
                    entryIds = emptyList(),
                )
            }
        }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun logSupplement(
        supplementId: String,
        date: String?,
    ): SupplementLog {
        val now = Clock.System.now().toString()
        val logDate = date ?: now.substring(0, 10)
        val temp =
            SupplementLog(
                supplementId = supplementId,
                date = logDate,
                takenAt = now,
                entryIds = emptyList(),
            )
        db.bissbilanzDatabaseQueries.insertSupplementLog(
            id = cacheKeyFor(temp.supplementId, temp.date),
            supplementId = temp.supplementId,
            date = temp.date,
            takenAt = temp.takenAt,
        )
        syncQueue.enqueue(SyncOperation.LogSupplement(supplementId, date))
        return temp
    }

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) {
        db.bissbilanzDatabaseQueries.deleteSupplementLog(supplementId, date)
        syncQueue.enqueue(SyncOperation.UnlogSupplement(supplementId, date))
    }

    suspend fun getHistory(
        from: String,
        to: String,
    ): List<SupplementHistoryEntry> =
        try {
            api.getSupplementHistory(from, to).history
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val logs =
                db.bissbilanzDatabaseQueries
                    .selectSupplementLogsByDateRange(from, to)
                    .executeAsList()
            val supplements =
                db.bissbilanzDatabaseQueries
                    .selectAllSupplements()
                    .executeAsList()
                    .mapNotNull { row -> json.decodeOrNull<Supplement>(row.jsonData)?.let { row.id to it } }
                    .toMap()
            logs.map { log ->
                val supplement = supplements[log.supplementId]
                SupplementHistoryEntry(
                    supplementId = log.supplementId,
                    supplementName = supplement?.name ?: "",
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
        }

    suspend fun getAllSupplements(): List<Supplement> =
        try {
            val all = api.getAllSupplements().supplements
            cacheSupplements(all, includeInactive = true)
            all
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.bissbilanzDatabaseQueries.selectAllSupplements().executeAsList()
            if (cached.isNotEmpty()) {
                cached.mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) }
            } else {
                throw e
            }
        }

    private fun cacheSupplement(supplement: Supplement) {
        db.bissbilanzDatabaseQueries.insertSupplement(
            id = supplement.id,
            name = supplement.name,
            isActive = if (supplement.isActive) 1L else 0L,
            sortOrder = supplement.sortOrder.toLong(),
            jsonData = json.encodeToString(supplement),
        )
    }

    private fun cacheSupplements(
        supplements: List<Supplement>,
        includeInactive: Boolean = false,
    ) {
        db.bissbilanzDatabaseQueries.transaction {
            if (includeInactive) {
                db.bissbilanzDatabaseQueries.deleteAllSupplements()
            }
            supplements.forEach { supplement -> cacheSupplement(supplement) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "supplements",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun supplementCreateToSupplement(
        supplement: SupplementCreate,
        id: String = "temp_${Uuid.random()}",
    ): Supplement =
        Supplement(
            id = id,
            userId = "",
            name = supplement.name,
            scheduleType = Supplement.ScheduleType.valueOf(supplement.scheduleType.name),
            scheduleDays = supplement.scheduleDays,
            scheduleStartDate = supplement.scheduleStartDate,
            isActive = supplement.isActive ?: true,
            sortOrder = supplement.sortOrder ?: 0,
            timeOfDay = supplement.timeOfDay?.let { Supplement.TimeOfDay.valueOf(it.name) },
            ingredients = emptyList(),
        )
}
