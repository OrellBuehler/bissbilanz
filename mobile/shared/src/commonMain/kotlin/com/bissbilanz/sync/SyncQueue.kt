package com.bissbilanz.sync

import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

data class QueuedRequest(
    val id: Long,
    val operation: SyncOperation,
    val createdAt: Long,
    val retryCount: Long,
    val idempotencyKey: String,
    val clientEditedAt: String,
    val nextAttemptAt: Long,
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

    @OptIn(ExperimentalUuidApi::class)
    suspend fun enqueue(operation: SyncOperation) {
        // In Local mode the local DB is the primary store, so nothing is queued for
        // upload. The login migrator uploads the cache state when switching to Synced;
        // queued ops would double-apply.
        if (appModeManager.isLocal) return
        val now = Clock.System.now()
        mutex.withLock {
            db.bissbilanzDatabaseQueries.insertSyncQueueItem(
                operation = json.encodeToString(SyncOperation.serializer(), operation),
                createdAt = now.toEpochMilliseconds(),
                affectedTable = operation.affectedTable,
                affectedId = operation.affectedId,
                idempotencyKey = Uuid.random().toString(),
                clientEditedAt = now.toString(),
            )
            _enqueueSignal.tryEmit(Unit)
        }
    }

    suspend fun drain(): List<QueuedRequest> =
        mutex.withLock {
            val nowMs = Clock.System.now().toEpochMilliseconds()
            db.bissbilanzDatabaseQueries
                .selectSyncQueue(nowMs)
                .executeAsList()
                .filter { it.id !in inProgress }
                .map {
                    inProgress.add(it.id)
                    QueuedRequest(
                        id = it.id,
                        operation = json.decodeFromString(SyncOperation.serializer(), it.operation),
                        createdAt = it.createdAt,
                        retryCount = it.retryCount,
                        idempotencyKey = it.idempotencyKey ?: it.id.toString(),
                        clientEditedAt = it.clientEditedAt ?: it.createdAt.toString(),
                        nextAttemptAt = it.nextAttemptAt,
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
                        idempotencyKey = it.idempotencyKey ?: it.id.toString(),
                        clientEditedAt = it.clientEditedAt ?: it.createdAt.toString(),
                        nextAttemptAt = it.nextAttemptAt,
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
                        idempotencyKey = it.idempotencyKey ?: it.id.toString(),
                        clientEditedAt = it.clientEditedAt ?: it.createdAt.toString(),
                        nextAttemptAt = it.nextAttemptAt,
                    )
                }
        }

    // Note: an item that has already been drained (in progress) can still be rewritten or
    // removed here while its original payload is in flight. That small race is accepted —
    // the in-flight upload wins and the local change for that item is lost.
    // The idempotencyKey is NOT changed: coalescing never changes the logical operation.
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

    suspend fun setNextAttemptAt(
        id: Long,
        nextAttemptAt: Long,
    ) {
        mutex.withLock {
            db.bissbilanzDatabaseQueries.updateSyncQueueNextAttemptAt(nextAttemptAt, id)
        }
    }

    /**
     * Soonest future backoff gate among the queued items, or null when nothing is
     * waiting on one. The manager arms a timer on this so a backed-off item retries on
     * its own, instead of sitting until the next enqueue or connectivity flip.
     */
    suspend fun nextRetryAt(): Long? =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectNextSyncQueueRetryAt(Clock.System.now().toEpochMilliseconds())
                .executeAsOneOrNull()
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

/**
 * Rewrites the still-queued Create operation(s) for [tempId] on [table] so the eventual
 * upload carries edits made while the create is still offline. [transform] receives the
 * queued operation and returns the rewritten one, or null to skip (e.g. wrong operation
 * type, or the body could not be decoded) — matching the previous per-repository
 * `coalesceQueuedCreate` behavior of leaving unmatched/undecodable entries untouched.
 *
 * If the create has already drained (no queued op found for [tempId]), this is a no-op —
 * the temp id is unknown server-side by then.
 */
suspend fun SyncQueue.rewriteQueuedCreate(
    table: String,
    tempId: String,
    transform: (SyncOperation) -> SyncOperation?,
) {
    for (req in findByAffected(table, tempId)) {
        val rewritten = transform(req.operation) ?: continue
        replaceOperation(req.id, rewritten)
    }
}
