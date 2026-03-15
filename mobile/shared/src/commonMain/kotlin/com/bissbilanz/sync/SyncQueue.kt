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
    val retryCount: Long,
)

class SyncQueue(
    private val db: BissbilanzDatabase,
) {
    private val inProgress = mutableSetOf<Long>()

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
        db.bissbilanzDatabaseQueries
            .selectSyncQueue()
            .executeAsList()
            .filter { it.id !in inProgress }
            .map {
                inProgress.add(it.id)
                QueuedRequest(
                    id = it.id,
                    method = it.method,
                    url = it.url,
                    body = it.body,
                    createdAt = it.createdAt,
                    affectedTable = it.affectedTable,
                    affectedId = it.affectedId,
                    retryCount = it.retryCount,
                )
            }

    fun remove(id: Long) {
        inProgress.remove(id)
        db.bissbilanzDatabaseQueries.deleteSyncQueueItem(id)
    }

    fun markDone(id: Long) {
        inProgress.remove(id)
    }

    fun incrementRetryCount(id: Long) {
        db.bissbilanzDatabaseQueries.incrementSyncQueueRetryCount(id)
    }

    fun getRetryCount(id: Long): Long =
        db.bissbilanzDatabaseQueries
            .selectSyncQueueItemRetryCount(id)
            .executeAsOneOrNull() ?: 0

    fun pendingCount(): Long = db.bissbilanzDatabaseQueries.countSyncQueue().executeAsOne()

    fun clear() {
        inProgress.clear()
        db.bissbilanzDatabaseQueries.clearSyncQueue()
    }
}
