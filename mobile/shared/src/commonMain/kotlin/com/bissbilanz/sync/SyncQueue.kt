package com.bissbilanz.sync

import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
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
    private val appModeManager: AppModeManager,
) {
    private val mutex = Mutex()
    private val inProgress = mutableSetOf<Long>()

    private val _enqueueSignal = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val enqueueSignal: SharedFlow<Unit> = _enqueueSignal.asSharedFlow()

    suspend fun enqueue(operation: SyncOperation) {
        // In Local mode the local DB is the primary store, so nothing is queued for
        // upload. The login migrator uploads the cache state when switching to Synced;
        // queued ops would double-apply.
        if (appModeManager.isLocal) return
        mutex.withLock {
            db.bissbilanzDatabaseQueries.insertSyncQueueItem(
                operation = json.encodeToString(SyncOperation.serializer(), operation),
                createdAt = Clock.System.now().toEpochMilliseconds(),
                affectedTable = operation.affectedTable,
                affectedId = operation.affectedId,
            )
            _enqueueSignal.tryEmit(Unit)
        }
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

    /** Snapshot of every queued operation, including drained/in-flight ones. */
    suspend fun all(): List<QueuedRequest> =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectAllSyncQueue()
                .executeAsList()
                .map {
                    QueuedRequest(
                        id = it.id,
                        operation = json.decodeFromString(SyncOperation.serializer(), it.operation),
                        createdAt = it.createdAt,
                        retryCount = it.retryCount,
                    )
                }
        }

    suspend fun findByAffected(
        table: String,
        id: String,
    ): List<QueuedRequest> =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectSyncQueueByAffected(table, id)
                .executeAsList()
                .map {
                    QueuedRequest(
                        id = it.id,
                        operation = json.decodeFromString(SyncOperation.serializer(), it.operation),
                        createdAt = it.createdAt,
                        retryCount = it.retryCount,
                    )
                }
        }

    // Note: an item that has already been drained (in progress) can still be rewritten or
    // removed here while its original payload is in flight. That small race is accepted —
    // the in-flight upload wins and the local change for that item is lost.
    suspend fun replaceOperation(
        queueId: Long,
        operation: SyncOperation,
    ) {
        mutex.withLock {
            // affectedTable/affectedId stay the same: coalescing never changes them.
            db.bissbilanzDatabaseQueries.updateSyncQueueOperation(
                operation = json.encodeToString(SyncOperation.serializer(), operation),
                id = queueId,
            )
        }
    }

    /**
     * Replaces an operation INCLUDING its affected table/id columns. Used when a temp id
     * is remapped to its server id after a create drains — unlike coalescing, remapping
     * changes the id the operation is keyed on.
     */
    suspend fun replaceOperationAndAffected(
        queueId: Long,
        operation: SyncOperation,
    ) {
        mutex.withLock {
            db.bissbilanzDatabaseQueries.updateSyncQueueOperationAndAffected(
                operation = json.encodeToString(SyncOperation.serializer(), operation),
                affectedTable = operation.affectedTable,
                affectedId = operation.affectedId,
                id = queueId,
            )
        }
    }

    suspend fun removeByAffected(
        table: String,
        id: String,
    ) {
        mutex.withLock {
            db.bissbilanzDatabaseQueries.deleteSyncQueueByAffected(table, id)
        }
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
