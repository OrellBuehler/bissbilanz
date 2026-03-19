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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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
            .map { rows -> rows.map { json.decodeFromString<Supplement>(it.jsonData) } }

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
                        id = "log_${item.supplement.id}",
                        supplementId = item.supplement.id,
                        userId = "",
                        date = date,
                        takenAt = item.takenAt ?: "",
                    )
                }
            logs.forEach { log ->
                db.bissbilanzDatabaseQueries.insertSupplementLog(
                    id = log.id,
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
                    id = log.id,
                    supplementId = log.supplementId,
                    userId = "",
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
        }

    suspend fun logSupplement(
        supplementId: String,
        date: String?,
    ): SupplementLog {
        val now = Clock.System.now().toString()
        val logDate = date ?: now.substring(0, 10)
        val temp =
            SupplementLog(
                id = "temp_${Clock.System.now().toEpochMilliseconds()}",
                supplementId = supplementId,
                userId = "",
                date = logDate,
                takenAt = now,
            )
        db.bissbilanzDatabaseQueries.insertSupplementLog(
            id = temp.id,
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
                    .associate { it.id to json.decodeFromString<Supplement>(it.jsonData) }
            logs.map { log ->
                val supplement = supplements[log.supplementId]
                SupplementHistoryEntry(
                    log =
                        SupplementLog(
                            id = log.id,
                            supplementId = log.supplementId,
                            userId = "",
                            date = log.date,
                            takenAt = log.takenAt ?: "",
                        ),
                    supplementName = supplement?.name ?: "",
                    dosage = supplement?.dosage ?: 0.0,
                    dosageUnit = supplement?.dosageUnit ?: "",
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
                cached.map { json.decodeFromString<Supplement>(it.jsonData) }
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

    private fun supplementCreateToSupplement(
        supplement: SupplementCreate,
        id: String = "temp_${Clock.System.now().toEpochMilliseconds()}",
    ): Supplement =
        Supplement(
            id = id,
            userId = "",
            name = supplement.name,
            dosage = supplement.dosage,
            dosageUnit = supplement.dosageUnit,
            scheduleType = Supplement.ScheduleType.valueOf(supplement.scheduleType.name),
            scheduleDays = supplement.scheduleDays,
            scheduleStartDate = supplement.scheduleStartDate,
            isActive = supplement.isActive ?: true,
            sortOrder = supplement.sortOrder ?: 0,
            timeOfDay = supplement.timeOfDay?.let { Supplement.TimeOfDay.valueOf(it.name) },
            ingredients = emptyList(),
        )
}
