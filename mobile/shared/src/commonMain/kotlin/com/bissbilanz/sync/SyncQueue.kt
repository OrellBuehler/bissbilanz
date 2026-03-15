package com.bissbilanz.sync

import com.bissbilanz.cache.BissbilanzDatabase
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import kotlinx.serialization.json.Json

data class QueuedRequest(
    val id: Long,
    val operation: SyncOperation,
    val createdAt: Long,
    val retryCount: Long,
)

class SyncQueue(
    private val db: BissbilanzDatabase,
    private val json: Json,
) {
    private val mutex = Mutex()
    private val inProgress = mutableSetOf<Long>()

    private val _enqueueSignal = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val enqueueSignal: SharedFlow<Unit> = _enqueueSignal.asSharedFlow()

    suspend fun enqueue(operation: SyncOperation) =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.insertSyncQueueItem(
                operation = json.encodeToString(SyncOperation.serializer(), operation),
                createdAt = Clock.System.now().toEpochMilliseconds(),
                affectedTable = operation.affectedTable,
                affectedId = operation.affectedId,
            )
            _enqueueSignal.tryEmit(Unit)
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
                        operation = json.decodeFromString(SyncOperation.serializer(), it.operation),
                        createdAt = it.createdAt,
                        retryCount = it.retryCount,
                    )
                }
        }

    suspend fun remove(id: Long) =
        mutex.withLock {
            inProgress.remove(id)
            db.bissbilanzDatabaseQueries.deleteSyncQueueItem(id)
        }

    suspend fun releaseForRetry(id: Long) =
        mutex.withLock {
            inProgress.remove(id)
        }

    suspend fun incrementAndGetRetryCount(id: Long): Long =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.incrementSyncQueueRetryCount(id)
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
