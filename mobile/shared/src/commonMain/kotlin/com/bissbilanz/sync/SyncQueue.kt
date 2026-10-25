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
    /** Set once the server permanently rejected the change; it is parked, not retried. */
    val failedAt: Long? = null,
    val failureReason: String? = null,
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
        mutex.withLock {
            insertLocked(operation)
            _enqueueSignal.tryEmit(Unit)
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun insertLocked(operation: SyncOperation) {
        val now = Clock.System.now()
        db.bissbilanzDatabaseQueries.insertSyncQueueItem(
            operation = json.encodeToString(SyncOperation.serializer(), operation),
            createdAt = now.toEpochMilliseconds(),
            affectedTable = operation.affectedTable,
            affectedId = operation.affectedId,
            idempotencyKey = Uuid.random().toString(),
            clientEditedAt = now.toString(),
        )
    }

    /**
     * Records that [tempId]'s create uploaded as [serverId]. A screen or sheet opened before
     * the upload (or restored after a restart) still holds the temp id, and so can a queued
     * change; without this their update/delete would target a row that no longer exists.
     * Temp ids are random UUIDs, so one flat map cannot collide across entity types.
     */
    suspend fun recordTempIdRemap(
        tempId: String,
        serverId: String,
    ) {
        val now = Clock.System.now().toEpochMilliseconds()
        mutex.withLock {
            db.bissbilanzDatabaseQueries.transaction {
                db.bissbilanzDatabaseQueries.deleteTempIdRemapsBefore(now - TEMP_ID_REMAP_RETENTION_MS)
                db.bissbilanzDatabaseQueries.upsertTempIdRemap(tempId, serverId, now)
            }
        }
    }

    /** The server id a drained create gave [id], or [id] itself when it was never remapped. */
    suspend fun resolveId(id: String): String =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectTempIdRemap(id)
                .executeAsOneOrNull() ?: id
        }

    /** Every recorded temp id → server id mapping (see [recordTempIdRemap]). */
    suspend fun tempIdRemaps(): Map<String, String> =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectAllTempIdRemaps()
                .executeAsList()
                .associate { it.tempId to it.serverId }
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
                    it.toQueuedRequest()
                }
        }

    private fun com.bissbilanz.cache.SyncQueue.toQueuedRequest() =
        QueuedRequest(
            id = id,
            operation = json.decodeFromString(SyncOperation.serializer(), operation),
            createdAt = createdAt,
            retryCount = retryCount,
            idempotencyKey = idempotencyKey ?: id.toString(),
            clientEditedAt = clientEditedAt ?: createdAt.toString(),
            nextAttemptAt = nextAttemptAt,
            failedAt = failedAt,
            failureReason = failureReason,
        )

    suspend fun remove(id: Long) =
        mutex.withLock {
            inProgress.remove(id)
            db.bissbilanzDatabaseQueries.deleteSyncQueueItem(id)
        }

    /**
     * Removes [id] like [remove], handing [followUp] the row as it stood at that moment
     * (null when it was already gone). An edit or delete made while the item was in flight
     * rewrites or removes its row; the operation [followUp] returns for it is queued in the
     * same transaction, so no change can slip in between and nothing is lost on a crash.
     */
    suspend fun removeWithFollowUp(
        id: Long,
        followUp: (QueuedRequest?) -> SyncOperation?,
    ): SyncOperation? =
        mutex.withLock {
            inProgress.remove(id)
            val queries = db.bissbilanzDatabaseQueries
            val queued =
                queries.transactionWithResult {
                    val row = queries.selectSyncQueueItem(id).executeAsOneOrNull()?.toQueuedRequest()
                    val next = followUp(row)
                    next?.let { insertLocked(it) }
                    queries.deleteSyncQueueItem(id)
                    next
                }
            if (queued != null) _enqueueSignal.tryEmit(Unit)
            queued
        }

    /**
     * Rewrites every queued operation with [transform] in one locked transaction, so an edit
     * coalesced into a row at the same time can't be overwritten by a stale copy of it.
     */
    suspend fun rewriteAll(transform: (SyncOperation) -> SyncOperation) {
        mutex.withLock {
            val queries = db.bissbilanzDatabaseQueries
            queries.transaction {
                for (row in queries.selectAllSyncQueue().executeAsList()) {
                    val req = row.toQueuedRequest()
                    val rewritten = transform(req.operation)
                    if (rewritten != req.operation) {
                        queries.updateSyncQueueOperationAndAffected(
                            operation = json.encodeToString(SyncOperation.serializer(), rewritten),
                            affectedTable = rewritten.affectedTable,
                            affectedId = rewritten.affectedId,
                            id = req.id,
                        )
                    }
                }
            }
        }
    }

    /**
     * Rewrites the queued operations for [table]/[id] with [transform] (null leaves one
     * untouched) in one locked transaction. Returns whether any row was rewritten.
     */
    suspend fun rewriteByAffected(
        table: String,
        id: String,
        transform: (SyncOperation) -> SyncOperation?,
    ): Boolean =
        mutex.withLock {
            val queries = db.bissbilanzDatabaseQueries
            queries.transactionWithResult {
                var rewroteAny = false
                for (row in queries.selectSyncQueueByAffected(table, id).executeAsList()) {
                    val rewritten = transform(row.toQueuedRequest().operation) ?: continue
                    queries.updateSyncQueueOperation(
                        operation = json.encodeToString(SyncOperation.serializer(), rewritten),
                        id = row.id,
                    )
                    rewroteAny = true
                }
                rewroteAny
            }
        }

    /** Snapshot of every queued operation, including drained/in-flight ones. */
    suspend fun all(): List<QueuedRequest> =
        mutex.withLock {
            db.bissbilanzDatabaseQueries
                .selectAllSyncQueue()
                .executeAsList()
                .map {
                    it.toQueuedRequest()
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
                    it.toQueuedRequest()
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

    /** Removes the queued operations for [table]/[id]; returns how many there were. */
    suspend fun removeByAffected(
        table: String,
        id: String,
    ): Int =
        mutex.withLock {
            val queries = db.bissbilanzDatabaseQueries
            queries.transactionWithResult {
                val count = queries.selectSyncQueueByAffected(table, id).executeAsList().size
                queries.deleteSyncQueueByAffected(table, id)
                count
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

    /** Changes still waiting to upload. Parked (permanently rejected) changes are not counted. */
    suspend fun pendingCount(): Long =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.countSyncQueue().executeAsOne()
        }

    suspend fun failedCount(): Long =
        mutex.withLock {
            db.bissbilanzDatabaseQueries.countFailedSyncQueue().executeAsOne()
        }

    /**
     * Parks [id]: the server permanently rejected it, so it leaves the drain but stays in
     * the queue until the user retries or discards it. Never deletes the change.
     */
    suspend fun park(
        id: Long,
        reason: String,
    ) {
        mutex.withLock {
            inProgress.remove(id)
            db.bissbilanzDatabaseQueries.parkSyncQueueItem(Clock.System.now().toEpochMilliseconds(), reason, id)
        }
    }

    /**
     * Puts a parked change back in line for the next drain; null retries every parked change.
     * Each gets a fresh idempotency key (the server replays a rejection stored under the old
     * one) and keeps its client edit time, so last-write-wins still compares the original edit.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun unpark(id: Long? = null) {
        mutex.withLock {
            val queries = db.bissbilanzDatabaseQueries
            queries.transaction {
                val ids = if (id == null) queries.selectParkedSyncQueueIds().executeAsList() else listOf(id)
                for (parkedId in ids) {
                    queries.unparkSyncQueueItem(Uuid.random().toString(), parkedId)
                }
            }
        }
        _enqueueSignal.tryEmit(Unit)
    }

    /** Deletes a parked change for good (the user chose to); null discards every parked change. */
    suspend fun discardParked(id: Long? = null) {
        mutex.withLock {
            if (id == null) {
                db.bissbilanzDatabaseQueries.deleteFailedSyncQueue()
            } else {
                db.bissbilanzDatabaseQueries.deleteFailedSyncQueueItem(id)
            }
        }
    }

    suspend fun clear() =
        mutex.withLock {
            inProgress.clear()
            db.bissbilanzDatabaseQueries.clearSyncQueue()
            db.bissbilanzDatabaseQueries.clearTempIdRemaps()
        }

    private companion object {
        /** A temp id outlives its upload only in open screens and the queue; a month is ample. */
        const val TEMP_ID_REMAP_RETENTION_MS = 30L * 24 * 60 * 60 * 1000
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
): Boolean = rewriteByAffected(table, tempId, transform)
