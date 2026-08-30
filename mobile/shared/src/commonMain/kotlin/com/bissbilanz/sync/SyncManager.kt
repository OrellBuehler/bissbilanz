package com.bissbilanz.sync

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.*
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.cacheEntryRow
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.isTempId
import io.ktor.serialization.ContentConvertException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.datetime.Clock
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.math.min
import com.bissbilanz.model.Entry as LocalEntry

data class SyncState(
    val isSyncing: Boolean = false,
    val pendingCount: Long = 0,
    val lastSyncedAt: Long? = null,
    val errors: List<String> = emptyList(),
    val conflictNotices: List<String> = emptyList(),
)

class SyncManager(
    private val syncQueue: SyncQueue,
    private val connectivityProvider: ConnectivityProvider,
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    /** A drained create succeeded: [tempId] now lives on the server as [serverId]. */
    private data class TempIdRemap(
        val tempId: String,
        val serverId: String,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(SyncState())
    val state: StateFlow<SyncState> = _state.asStateFlow()

    private val syncMutex = Mutex()
    private var onSynced: (suspend () -> Unit)? = null

    /**
     * Invoked once per drain that resolved at least one conflict, so the app layer can
     * pull the affected entities back down. Without it the row that *lost* keeps showing
     * its superseded value until some unrelated refresh overwrites it. Set by the app
     * (the shared module has no access to the platform refresh manager).
     */
    var onConflictResolved: (suspend () -> Unit)? = null

    /** Pending delayed re-drain, armed for when the soonest backoff gate expires. */
    private var retryJob: Job? = null

    /**
     * Whether a drain may arm [retryJob]. Only the running app wants a background
     * timer; unit tests drive [syncPendingQueue] directly and would otherwise leave
     * real delays running against a torn-down database.
     */
    private var autoRetryEnabled = false

    fun startNetworkListener(onSynced: (suspend () -> Unit)? = null) {
        this.onSynced = onSynced
        autoRetryEnabled = true
        scope.launch {
            _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())

            connectivityProvider.isOnline.collect { online ->
                if (online) {
                    val count = syncPendingQueue()
                    if (count > 0) this@SyncManager.onSynced?.invoke()
                }
            }
        }
        scope.launch {
            syncQueue.enqueueSignal.collect {
                if (connectivityProvider.isOnline.value) {
                    val count = syncPendingQueue()
                    if (count > 0) this@SyncManager.onSynced?.invoke()
                }
            }
        }
    }

    suspend fun syncPendingQueue(): Int {
        // In Local mode nothing is enqueued and nothing may be uploaded. The network
        // listener can keep running; it simply becomes a no-op.
        if (appModeManager.isLocal) return 0
        if (!syncMutex.tryLock()) return 0
        var synced = 0
        var sawConflict = false
        var drained: List<QueuedRequest> = emptyList()
        try {
            if (!connectivityProvider.isOnline.value) return 0

            _state.value = _state.value.copy(isSyncing = true, errors = emptyList())
            drained = syncQueue.drain()
            _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())

            // Temp ids whose creates drained in THIS batch. The drained snapshot still
            // carries the original payloads, so later operations in the batch are
            // remapped in memory; operations still sitting in the queue (including ones
            // beyond the drain limit) are rewritten in place after each create succeeds.
            val remaps = mutableMapOf<String, String>()

            for (req in drained) {
                try {
                    val op = remapTempIds(req.operation, remaps, json)
                    val remap = execute(op, req.idempotencyKey, req.clientEditedAt)
                    if (remap != null) {
                        remaps[remap.tempId] = remap.serverId
                        rewriteQueuedReferences(remap.tempId, remap.serverId)
                    }
                    syncQueue.remove(req.id)
                    synced++
                } catch (e: UnauthorizedException) {
                    syncQueue.releaseForRetry(req.id)
                    addError("Session expired. Please log in again to sync pending changes.")
                    break
                } catch (e: ApiException) {
                    val isDelete = isDeleteOperation(req.operation)
                    val conflictHeader = e.rawResponse?.headers?.get("X-Sync-Conflict")
                    when {
                        // 404/410 on DELETE → idempotent; treat as success
                        e.statusCode in listOf(404, 410) && isDelete -> {
                            syncQueue.remove(req.id)
                            synced++
                        }

                        // 404/410 on PATCH/PUT/POST → record deleted elsewhere; surface notice
                        e.statusCode in listOf(404, 410) -> {
                            syncQueue.remove(req.id)
                            synced++
                            addConflict(
                                "Offline change to ${req.operation.description} was lost: the record was deleted on another device.",
                            )
                            sawConflict = true
                        }

                        // 409 with X-Sync-Conflict: server-newer → LWW lost; surface notice
                        e.statusCode == 409 && conflictHeader == "server-newer" -> {
                            syncQueue.remove(req.id)
                            synced++
                            addConflict(
                                "Offline change to ${req.operation.description} was superseded by a newer change from another device.",
                            )
                            sawConflict = true
                        }

                        // 409 without header → real duplicate/validation conflict; dead-letter
                        e.statusCode == 409 -> {
                            syncQueue.remove(req.id)
                            synced++
                            addError("Failed to sync ${req.operation.description}: HTTP ${e.statusCode}")
                        }

                        // Other 4xx client errors → dead-letter
                        e.statusCode in 400..499 -> {
                            syncQueue.remove(req.id)
                            synced++
                            addError("Failed to sync ${req.operation.description}: HTTP ${e.statusCode}")
                        }

                        // 5xx / network errors → exponential backoff
                        else -> {
                            val count = syncQueue.incrementAndGetRetryCount(req.id)
                            if (count >= MAX_RETRIES) {
                                syncQueue.remove(req.id)
                                synced++
                                addError(
                                    "Gave up syncing ${req.operation.description} after $MAX_RETRIES retries.",
                                )
                            } else {
                                val delay = backoffMs(count, req.id)
                                syncQueue.setNextAttemptAt(req.id, Clock.System.now().toEpochMilliseconds() + delay)
                                syncQueue.releaseForRetry(req.id)
                                break
                            }
                        }
                    }
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                    val count = syncQueue.incrementAndGetRetryCount(req.id)
                    if (count >= MAX_RETRIES) {
                        syncQueue.remove(req.id)
                        synced++
                        addError(
                            "Gave up syncing ${req.operation.description} after $MAX_RETRIES retries.",
                        )
                    } else {
                        val delay = backoffMs(count, req.id)
                        syncQueue.setNextAttemptAt(req.id, Clock.System.now().toEpochMilliseconds() + delay)
                        syncQueue.releaseForRetry(req.id)
                        // Skip a payload this build cannot serialize: it is broken for this one
                        // operation, and parking the rest of the queue behind it buys nothing.
                        // Everything else caught here is a transport failure that every remaining
                        // upload would hit too, so stop — continuing would spend all five retries
                        // of every queued item on one outage and dead-letter the lot.
                        if (!isPayloadFailure(e)) break
                    }
                }

                _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())
            }
        } finally {
            // Release any drained-but-unprocessed items back to the queue. An early
            // break (session expiry, 5xx backoff, or a network drop mid-batch) leaves
            // the tail of the drained batch flagged in-progress; because drain() skips
            // in-progress ids, those ops — the offline edits queued behind the failed
            // one — would otherwise never upload again this session. remove()/
            // releaseForRetry() already cleared the processed items, so this is a no-op
            // for them and frees only the stranded tail for the next drain.
            drained.forEach { syncQueue.releaseForRetry(it.id) }
            val pending = syncQueue.pendingCount()
            _state.value =
                _state.value.copy(
                    isSyncing = false,
                    pendingCount = pending,
                    lastSyncedAt =
                        if (synced > 0) {
                            Clock.System.now().toEpochMilliseconds()
                        } else {
                            _state.value.lastSyncedAt
                        },
                )
            syncMutex.unlock()
            // An item parked in exponential backoff gets no enqueue or connectivity
            // event to nudge it, so without this the whole queue sits until the user
            // happens to write again. Armed after the unlock so the timer's own drain
            // can take the mutex.
            scheduleRetryDrain()
        }

        // Once per drain, not once per conflict: a batch that lost three edits needs
        // one refresh, and this runs outside the mutex so it can't deadlock the drain.
        if (sawConflict) {
            try {
                onConflictResolved?.invoke()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }

        return synced
    }

    /**
     * Arms a single timer to re-drain when the soonest backed-off item comes due.
     * Replaces any previously armed timer — every drain recomputes the gate.
     */
    private fun scheduleRetryDrain() {
        if (!autoRetryEnabled) return
        retryJob?.cancel()
        retryJob =
            scope.launch {
                val dueAt = syncQueue.nextRetryAt() ?: return@launch
                val wait = dueAt - Clock.System.now().toEpochMilliseconds()
                delay(maxOf(wait, 0L) + RETRY_SLACK_MS)
                // Drop the self-reference before draining: the drain re-arms this timer
                // from its finally block, and cancelling the job we are currently
                // running would kill the onSynced callback below.
                retryJob = null
                if (!connectivityProvider.isOnline.value) return@launch
                val count = syncPendingQueue()
                if (count > 0) onSynced?.invoke()
            }
    }

    /**
     * Executes one operation threading the idempotency headers. For creates of records
     * that other records can reference (foods, recipes, supplements) the server response
     * replaces the local temp row and the resulting temp→server id mapping is returned so
     * still-queued references can be rewritten.
     */
    @Suppress("CyclomaticComplexMethod")
    private suspend fun execute(
        op: SyncOperation,
        idempotencyKey: String,
        clientEditedAt: String,
    ): TempIdRemap? {
        when (op) {
            is SyncOperation.CreateFood -> {
                val server =
                    api.createFood(
                        json.decodeFromString<FoodCreate>(op.body),
                        idempotencyKey,
                        clientEditedAt,
                    )
                return op.localId?.takeIf { it.isTempId() }?.let { tempId ->
                    replaceLocalFood(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateFood -> {
                api.updateFood(op.id, json.decodeFromString<FoodCreate>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.DeleteFood -> {
                api.deleteFood(op.id, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.ToggleFavorite -> {
                api.toggleFavorite(op.id, op.isFavorite, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.SetFoodImage -> {
                api.setFoodImage(op.id, op.imageUrl, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.CreateEntry -> {
                val server = api.createEntry(json.decodeFromString<EntryCreate>(op.body), idempotencyKey, clientEditedAt)
                return op.localId?.takeIf { it.isTempId() }?.let { tempId ->
                    replaceLocalEntry(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateEntry -> {
                api.updateEntry(op.id, json.decodeFromString<EntryUpdate>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.DeleteEntry -> {
                api.deleteEntry(op.id, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.CreateRecipe -> {
                val server =
                    api.createRecipe(json.decodeFromString<RecipeCreate>(op.body), idempotencyKey, clientEditedAt)
                return op.localId?.takeIf { it.isTempId() }?.let { tempId ->
                    replaceLocalRecipe(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateRecipe -> {
                api.updateRecipe(op.id, json.decodeFromString<RecipeUpdate>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.DeleteRecipe -> {
                api.deleteRecipe(op.id, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.SetGoals -> {
                api.setGoals(json.decodeFromString<Goals>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.CreateWeight -> {
                val server =
                    api.createWeightEntry(
                        json.decodeFromString<WeightCreate>(op.body),
                        idempotencyKey,
                        clientEditedAt,
                    )
                return op.localId?.takeIf { it.isTempId() }?.let { tempId ->
                    replaceLocalWeight(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateWeight -> {
                api.updateWeightEntry(
                    op.id,
                    json.decodeFromString<WeightUpdate>(op.body),
                    idempotencyKey,
                    clientEditedAt,
                )
            }

            is SyncOperation.DeleteWeight -> {
                api.deleteWeightEntry(op.id, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.CreateSupplement -> {
                val server =
                    api.createSupplement(
                        json.decodeFromString<SupplementCreate>(op.body),
                        idempotencyKey,
                        clientEditedAt,
                    )
                return op.localId?.takeIf { it.isTempId() }?.let { tempId ->
                    replaceLocalSupplement(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateSupplement -> {
                api.updateSupplement(
                    op.id,
                    json.decodeFromString<SupplementCreate>(op.body),
                    idempotencyKey,
                    clientEditedAt,
                )
            }

            is SyncOperation.DeleteSupplement -> {
                api.deleteSupplement(op.id, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.LogSupplement -> {
                api.logSupplement(op.supplementId, op.date, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.UnlogSupplement -> {
                api.unlogSupplement(op.supplementId, op.date, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.SetDayProperties -> {
                api.setDayProperties(op.date, op.isFastingDay, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.DeleteDayProperties -> {
                api.deleteDayProperties(op.date, idempotencyKey, clientEditedAt)
            }

            is SyncOperation.UpdatePreferences -> {
                api.updatePreferences(json.decodeFromString<PreferencesUpdate>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.CreateSleep -> {
                api.createSleepEntry(json.decodeFromString<SleepCreate>(op.body), idempotencyKey, clientEditedAt)
            }

            is SyncOperation.UpdateSleep -> {
                api.updateSleepEntry(
                    op.id,
                    json.decodeFromString<SleepUpdate>(op.body),
                    idempotencyKey,
                    clientEditedAt,
                )
            }

            is SyncOperation.DeleteSleep -> {
                api.deleteSleepEntry(op.id, idempotencyKey, clientEditedAt)
            }
        }
        return null
    }

    /** Rewrites every still-queued operation that references [tempId] to use [serverId]. */
    private suspend fun rewriteQueuedReferences(
        tempId: String,
        serverId: String,
    ) {
        val remap = mapOf(tempId to serverId)
        for (req in syncQueue.all()) {
            val rewritten = remapTempIds(req.operation, remap, json)
            if (rewritten != req.operation) {
                syncQueue.replaceOperationAndAffected(req.id, rewritten)
            }
        }
    }

    private fun isDeleteOperation(op: SyncOperation): Boolean =
        op is SyncOperation.DeleteFood ||
            op is SyncOperation.DeleteEntry ||
            op is SyncOperation.DeleteRecipe ||
            op is SyncOperation.DeleteWeight ||
            op is SyncOperation.DeleteSupplement ||
            op is SyncOperation.DeleteSleep ||
            op is SyncOperation.DeleteDayProperties ||
            op is SyncOperation.UnlogSupplement

    /**
     * Whether [e] blames the operation's payload rather than the server or the network:
     * a stored operation this build can no longer decode, a request body it cannot encode,
     * or a response it cannot read. Ktor reports response-decode failures as
     * [ContentConvertException] rather than a [SerializationException], and both may sit
     * one or two `cause` levels down, so the chain is walked.
     */
    private fun isPayloadFailure(e: Throwable): Boolean {
        var cause: Throwable? = e
        var depth = 0
        while (cause != null && depth < CAUSE_CHAIN_LIMIT) {
            if (cause is SerializationException || cause is ContentConvertException) return true
            cause = cause.cause.takeIf { it !== cause }
            depth++
        }
        return false
    }

    /**
     * Exponential backoff: BASE * 2^retryCount + small jitter capped at CAP.
     * jitter uses retryCount as a deterministic seed to avoid requiring kotlin.random
     * in common code.
     */
    private fun backoffMs(
        retryCount: Long,
        id: Long,
    ): Long {
        val base = BACKOFF_BASE_MS * (1L shl retryCount.coerceAtMost(20).toInt())
        val jitter = (id % BACKOFF_JITTER_MS)
        return min(base + jitter, BACKOFF_CAP_MS)
    }

    private fun replaceLocalEntry(
        tempId: String,
        server: LocalEntry,
    ) {
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            queries.deleteEntry(tempId)
            queries.cacheEntryRow(server, json)
        }
    }

    private fun replaceLocalWeight(
        tempId: String,
        server: WeightEntry,
    ) {
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            queries.deleteWeightEntry(tempId)
            queries.insertWeightEntry(
                id = server.id,
                entryDate = server.entryDate,
                weightKg = server.weightKg,
                loggedAt = server.loggedAt,
                jsonData = json.encodeToString(server),
            )
        }
    }

    private fun replaceLocalFood(
        tempId: String,
        server: Food,
    ) {
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            queries.deleteFood(tempId)
            queries.insertFood(
                id = server.id,
                name = server.name,
                brand = server.brand,
                calories = server.calories,
                protein = server.protein,
                carbs = server.carbs,
                fat = server.fat,
                fiber = server.fiber,
                isFavorite = if (server.isFavorite) 1L else 0L,
                barcode = server.barcode,
                jsonData = json.encodeToString(server),
            )
        }
    }

    private fun replaceLocalRecipe(
        tempId: String,
        server: RecipeDetail,
    ) {
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            queries.deleteRecipe(tempId)
            queries.insertRecipe(
                id = server.id,
                name = server.name,
                totalServings = server.totalServings,
                isFavorite = if (server.isFavorite) 1L else 0L,
                calories = server.calories,
                protein = server.protein,
                carbs = server.carbs,
                fat = server.fat,
                fiber = server.fiber,
                jsonData = json.encodeToString(server),
            )
        }
    }

    private fun replaceLocalSupplement(
        tempId: String,
        server: Supplement,
    ) {
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            queries.deleteSupplement(tempId)
            queries.insertSupplement(
                id = server.id,
                name = server.name,
                isActive = if (server.isActive) 1L else 0L,
                sortOrder = server.sortOrder.toLong(),
                jsonData = json.encodeToString(server),
            )
            // The synthesized log cache key embeds the supplement id — re-key any local
            // logs so unlogging and the offline checklist keep working after the remap.
            for (log in queries.selectSupplementLogsBySupplementId(tempId).executeAsList()) {
                queries.deleteSupplementLogById(log.id)
                queries.insertSupplementLog(
                    id = "${server.id}-${log.date}",
                    supplementId = server.id,
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
        }
    }

    private fun addError(message: String) {
        _state.value = _state.value.copy(errors = _state.value.errors + message)
    }

    private fun addConflict(message: String) {
        _state.value = _state.value.copy(conflictNotices = _state.value.conflictNotices + message)
    }

    /** Drops the conflict notices once the user has acknowledged them. */
    fun clearConflictNotices() {
        _state.value = _state.value.copy(conflictNotices = emptyList())
    }

    companion object {
        private const val MAX_RETRIES = 5
        private const val BACKOFF_BASE_MS = 2_000L
        private const val BACKOFF_CAP_MS = 5 * 60 * 1_000L
        private const val BACKOFF_JITTER_MS = 500L

        /** Slack past the backoff gate, so the retry can't land a tick early. */
        private const val RETRY_SLACK_MS = 50L

        /** Depth [isPayloadFailure] walks a `cause` chain before giving up. */
        private const val CAUSE_CHAIN_LIMIT = 5
    }
}
