package com.bissbilanz.sync

import com.bissbilanz.cache.BissbilanzDatabase
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val mutex = Mutex()
    private val inProgress = mutableSetOf<Long>()

    suspend fun enqueue(
        method: String,
        url: String,
        body: String,
        affectedTable: String? = null,
        affectedId: String? = null,
    ) = mutex.withLock {
        db.bissbilanzDatabaseQueries.insertSyncQueueItem(
            method = method,
            url = url,
            body = body,
            createdAt = Clock.System.now().toEpochMilliseconds(),
            affectedTable = affectedTable,
            affectedId = affectedId,
        )
    }

    suspend fun drain(): List<QueuedRequest> =
        mutex.withLock {
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
        }

    suspend fun remove(id: Long) =
        mutex.withLock {
            inProgress.remove(id)
            db.bissbilanzDatabaseQueries.deleteSyncQueueItem(id)
        }

    suspend fun markDone(id: Long) =
        mutex.withLock {
            inProgress.remove(id)
        }

    suspend fun incrementRetryCount(id: Long) =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.incrementSyncQueueRetryCount(id)
        }

    suspend fun getRetryCount(id: Long): Long =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectSyncQueueItemRetryCount(id)
                .executeAsOneOrNull() ?: 0
        }

    suspend fun pendingCount(): Long =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.countSyncQueue().executeAsOne()
        }

    suspend fun clear() =
        mutex.withLock {
            inProgress.clear()
            db.bissbilanzDatabaseQueries.clearSyncQueue()
        }
}
