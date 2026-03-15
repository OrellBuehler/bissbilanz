package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class SupplementRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
    private val json: Json,
) {
    fun supplements(): Flow<List<Supplement>> =
        db.bissbilanzDatabaseQueries
            .selectActiveSupplements()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { json.decodeFromString<Supplement>(it.jsonData) } }

    suspend fun refresh() {
        try {
            val supplements = api.getSupplements()
            cacheSupplements(supplements)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        if (!connectivity.isOnline.value) {
            val url = "/api/supplements"
            val body = json.encodeToString(supplement)
            val meta = urlToMeta(url)
            syncQueue.enqueue("POST", url, body, meta.affectedTable, meta.affectedId)
            val temp = supplementCreateToSupplement(supplement)
            cacheSupplement(temp)
            return temp
        }
        val created = api.createSupplement(supplement)
        cacheSupplement(created)
        return created
    }

    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
    ): Supplement {
        if (!connectivity.isOnline.value) {
            val url = "/api/supplements/$id"
            val body = json.encodeToString(supplement)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            val temp = supplementCreateToSupplement(supplement, id)
            cacheSupplement(temp)
            return temp
        }
        val updated = api.updateSupplement(id, supplement)
        cacheSupplement(updated)
        return updated
    }

    suspend fun deleteSupplement(id: String) {
        if (!connectivity.isOnline.value) {
            val url = "/api/supplements/$id"
            val meta = urlToMeta(url)
            syncQueue.enqueue("DELETE", url, "", meta.affectedTable, meta.affectedId)
        } else {
            api.deleteSupplement(id)
        }
        db.bissbilanzDatabaseQueries.deleteSupplement(id)
    }

    suspend fun getChecklist(date: String): List<SupplementLog> =
        try {
            val logs = api.getSupplementChecklist(date)
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
        if (!connectivity.isOnline.value) {
            val url = "/api/supplements/$supplementId/log"
            val body = json.encodeToString(mapOf("date" to date))
            syncQueue.enqueue("POST", url, body, "supplements", supplementId)
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
            return temp
        }
        val log = api.logSupplement(supplementId, date)
        db.bissbilanzDatabaseQueries.insertSupplementLog(
            id = log.id,
            supplementId = log.supplementId,
            date = log.date,
            takenAt = log.takenAt,
        )
        return log
    }

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) {
        if (!connectivity.isOnline.value) {
            val url = "/api/supplements/$supplementId/log?date=$date"
            syncQueue.enqueue("DELETE", url, "", "supplements", supplementId)
        } else {
            api.unlogSupplement(supplementId, date)
        }
        db.bissbilanzDatabaseQueries.deleteSupplementLog(supplementId, date)
    }

    suspend fun getHistory(
        from: String,
        to: String,
    ): List<SupplementHistoryEntry> =
        try {
            api.getSupplementHistory(from, to).history
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
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
                        SupplementHistoryLog(
                            id = log.id,
                            supplementId = log.supplementId,
                            userId = "",
                            date = log.date,
                            takenAt = log.takenAt,
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
            scheduleType = supplement.scheduleType,
            scheduleDays = supplement.scheduleDays,
            scheduleStartDate = supplement.scheduleStartDate,
            isActive = supplement.isActive ?: true,
            sortOrder = supplement.sortOrder ?: 0,
            timeOfDay = supplement.timeOfDay,
        )
}
