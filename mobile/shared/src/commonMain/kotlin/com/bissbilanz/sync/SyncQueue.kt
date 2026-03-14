package com.bissbilanz.sync

import com.bissbilanz.cache.BissbilanzDatabase
import kotlinx.datetime.Clock

data class QueuedRequest(
    val id: Long,
    val method: String,
    val url: String,
    val body: String,
    val createdAt: Long,
    val affectedTable: String?,
    val affectedId: String?,
)

class SyncQueue(
    private val db: BissbilanzDatabase,
) {
    fun enqueue(
        method: String,
        url: String,
        body: String,
        affectedTable: String? = null,
        affectedId: String? = null,
    ) {
        db.bissbilanzDatabaseQueries.insertSyncQueueItem(
            method = method,
            url = url,
            body = body,
            createdAt = Clock.System.now().toEpochMilliseconds(),
            affectedTable = affectedTable,
            affectedId = affectedId,
        )
    }

    fun drain(): List<QueuedRequest> =
        db.bissbilanzDatabaseQueries.selectSyncQueue().executeAsList().map {
            QueuedRequest(
                id = it.id,
                method = it.method,
                url = it.url,
                body = it.body,
                createdAt = it.createdAt,
                affectedTable = it.affectedTable,
                affectedId = it.affectedId,
            )
        }

    fun remove(id: Long) {
        db.bissbilanzDatabaseQueries.deleteSyncQueueItem(id)
    }

    fun pendingCount(): Long = db.bissbilanzDatabaseQueries.countSyncQueue().executeAsOne()

    fun clear() {
        db.bissbilanzDatabaseQueries.clearSyncQueue()
    }
}
