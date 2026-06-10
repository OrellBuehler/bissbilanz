package com.bissbilanz.sync

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.*
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class SyncState(
    val isSyncing: Boolean = false,
    val pendingCount: Long = 0,
    val lastSyncedAt: Long? = null,
    val errors: List<String> = emptyList(),
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

    fun startNetworkListener(onSynced: (suspend () -> Unit)? = null) {
        this.onSynced = onSynced
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
        try {
            if (!connectivityProvider.isOnline.value) return 0

            _state.value = _state.value.copy(isSyncing = true, errors = emptyList())
            val queued = syncQueue.drain()
            _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())

            // Temp ids whose creates drained in THIS batch. The drained snapshot still
            // carries the original payloads, so later operations in the batch are
            // remapped in memory; operations still sitting in the queue (including ones
            // beyond the drain limit) are rewritten in place after each create succeeds.
            val remaps = mutableMapOf<String, String>()

            for (req in queued) {
                try {
                    val remap = execute(remapTempIds(req.operation, remaps, json))
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
                    when {
                        e.statusCode in 400..499 -> {
                            syncQueue.remove(req.id)
                            synced++
                            addError("Failed to sync ${req.operation.description}: HTTP ${e.statusCode}")
                        }

                        else -> {
                            syncQueue.releaseForRetry(req.id)
                            val count = syncQueue.incrementAndGetRetryCount(req.id)
                            if (count >= MAX_RETRIES) {
                                syncQueue.remove(req.id)
                                synced++
                                addError(
                                    "Gave up syncing ${req.operation.description} after $MAX_RETRIES retries.",
                                )
                            } else {
                                break
                            }
                        }
                    }
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                    syncQueue.releaseForRetry(req.id)
                    break
                }

                _state.value = _state.value.copy(pendingCount = syncQueue.pendingCount())
            }
        } finally {
            val pending = syncQueue.pendingCount()
            _state.value =
                _state.value.copy(
                    isSyncing = false,
                    pendingCount = pending,
                    lastSyncedAt =
                        if (synced > 0) {
                            kotlinx.datetime.Clock.System
                                .now()
                                .toEpochMilliseconds()
                        } else {
                            _state.value.lastSyncedAt
                        },
                )
            syncMutex.unlock()
        }

        return synced
    }

    /**
     * Executes one operation. For creates of records that other records can reference
     * (foods, recipes, supplements) the server response replaces the local temp row and
     * the resulting temp→server id mapping is returned so still-queued references can be
     * rewritten. Other create responses stay ignored — nothing references those records
     * and their local rows self-heal on the next refresh.
     */
    @Suppress("CyclomaticComplexMethod")
    private suspend fun execute(op: SyncOperation): TempIdRemap? {
        when (op) {
            is SyncOperation.CreateFood -> {
                val server = api.createFood(json.decodeFromString<FoodCreate>(op.body))
                return op.localId?.takeIf { it.startsWith(TEMP_PREFIX) }?.let { tempId ->
                    replaceLocalFood(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateFood -> {
                api.updateFood(op.id, json.decodeFromString<FoodCreate>(op.body))
            }

            is SyncOperation.DeleteFood -> {
                api.deleteFood(op.id)
            }

            is SyncOperation.CreateEntry -> {
                api.createEntry(json.decodeFromString<EntryCreate>(op.body))
            }

            is SyncOperation.UpdateEntry -> {
                api.updateEntry(op.id, json.decodeFromString<EntryUpdate>(op.body))
            }

            is SyncOperation.DeleteEntry -> {
                api.deleteEntry(op.id)
            }

            is SyncOperation.CreateRecipe -> {
                val server = api.createRecipe(json.decodeFromString<RecipeCreate>(op.body))
                return op.localId?.takeIf { it.startsWith(TEMP_PREFIX) }?.let { tempId ->
                    replaceLocalRecipe(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateRecipe -> {
                api.updateRecipe(op.id, json.decodeFromString<RecipeUpdate>(op.body))
            }

            is SyncOperation.DeleteRecipe -> {
                api.deleteRecipe(op.id)
            }

            is SyncOperation.SetGoals -> {
                api.setGoals(json.decodeFromString<Goals>(op.body))
            }

            is SyncOperation.CreateWeight -> {
                api.createWeightEntry(json.decodeFromString<WeightCreate>(op.body))
            }

            is SyncOperation.UpdateWeight -> {
                api.updateWeightEntry(op.id, json.decodeFromString<WeightUpdate>(op.body))
            }

            is SyncOperation.DeleteWeight -> {
                api.deleteWeightEntry(op.id)
            }

            is SyncOperation.CreateSupplement -> {
                val server = api.createSupplement(json.decodeFromString<SupplementCreate>(op.body))
                return op.localId?.takeIf { it.startsWith(TEMP_PREFIX) }?.let { tempId ->
                    replaceLocalSupplement(tempId, server)
                    TempIdRemap(tempId, server.id)
                }
            }

            is SyncOperation.UpdateSupplement -> {
                api.updateSupplement(op.id, json.decodeFromString<SupplementCreate>(op.body))
            }

            is SyncOperation.DeleteSupplement -> {
                api.deleteSupplement(op.id)
            }

            is SyncOperation.LogSupplement -> {
                api.logSupplement(op.supplementId, op.date)
            }

            is SyncOperation.UnlogSupplement -> {
                api.unlogSupplement(op.supplementId, op.date)
            }

            is SyncOperation.SetDayProperties -> {
                api.setDayProperties(op.date, op.isFastingDay)
            }

            is SyncOperation.DeleteDayProperties -> {
                api.deleteDayProperties(op.date)
            }

            is SyncOperation.UpdatePreferences -> {
                api.updatePreferences(json.decodeFromString<PreferencesUpdate>(op.body))
            }

            is SyncOperation.CreateSleep -> {
                api.createSleepEntry(json.decodeFromString<SleepCreate>(op.body))
            }

            is SyncOperation.UpdateSleep -> {
                api.updateSleepEntry(op.id, json.decodeFromString<SleepUpdate>(op.body))
            }

            is SyncOperation.DeleteSleep -> {
                api.deleteSleepEntry(op.id)
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

    companion object {
        private const val MAX_RETRIES = 3
        private const val TEMP_PREFIX = "temp_"
    }
}
