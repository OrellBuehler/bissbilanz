package com.bissbilanz.sync

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.model.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
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
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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
        if (!syncMutex.tryLock()) return 0
        if (!connectivityProvider.isOnline.value) {
            syncMutex.unlock()
            return 0
        }

        _state.value = _state.value.copy(isSyncing = true, errors = emptyList())
        var synced = 0

        try {
            val queued = syncQueue.drain()
            _state.value = _state.value.copy(pendingCount = queued.size.toLong())

            for (req in queued) {
                try {
                    execute(req.operation)
                    syncQueue.remove(req.id)
                    synced++
                } catch (e: UnauthorizedException) {
                    syncQueue.markDone(req.id)
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
                            syncQueue.markDone(req.id)
                            syncQueue.incrementRetryCount(req.id)
                            val count = syncQueue.getRetryCount(req.id)
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
                    syncQueue.markDone(req.id)
                    break
                }

                _state.value = _state.value.copy(pendingCount = (queued.size - synced).toLong())
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

    @Suppress("CyclomaticComplexMethod")
    private suspend fun execute(op: SyncOperation) {
        when (op) {
            is SyncOperation.CreateFood ->
                api.createFood(json.decodeFromString<FoodCreate>(op.body))
            is SyncOperation.UpdateFood ->
                api.updateFood(op.id, json.decodeFromString<FoodCreate>(op.body))
            is SyncOperation.DeleteFood ->
                api.deleteFood(op.id)
            is SyncOperation.CreateEntry ->
                api.createEntry(json.decodeFromString<EntryCreate>(op.body))
            is SyncOperation.UpdateEntry ->
                api.updateEntry(op.id, json.decodeFromString<EntryUpdate>(op.body))
            is SyncOperation.DeleteEntry ->
                api.deleteEntry(op.id)
            is SyncOperation.CreateRecipe ->
                api.createRecipe(json.decodeFromString<RecipeCreate>(op.body))
            is SyncOperation.UpdateRecipe ->
                api.updateRecipe(op.id, json.decodeFromString<RecipeUpdate>(op.body))
            is SyncOperation.DeleteRecipe ->
                api.deleteRecipe(op.id)
            is SyncOperation.SetGoals ->
                api.setGoals(json.decodeFromString<Goals>(op.body))
            is SyncOperation.CreateWeight ->
                api.createWeightEntry(json.decodeFromString<WeightCreate>(op.body))
            is SyncOperation.UpdateWeight ->
                api.updateWeightEntry(op.id, json.decodeFromString<WeightUpdate>(op.body))
            is SyncOperation.DeleteWeight ->
                api.deleteWeightEntry(op.id)
            is SyncOperation.CreateSupplement ->
                api.createSupplement(json.decodeFromString<SupplementCreate>(op.body))
            is SyncOperation.UpdateSupplement ->
                api.updateSupplement(op.id, json.decodeFromString<SupplementCreate>(op.body))
            is SyncOperation.DeleteSupplement ->
                api.deleteSupplement(op.id)
            is SyncOperation.LogSupplement ->
                api.logSupplement(op.supplementId, op.date)
            is SyncOperation.UnlogSupplement ->
                api.unlogSupplement(op.supplementId, op.date)
            is SyncOperation.UpdatePreferences ->
                api.updatePreferences(json.decodeFromString<PreferencesUpdate>(op.body))
        }
    }

    private fun addError(message: String) {
        _state.value = _state.value.copy(errors = _state.value.errors + message)
    }

    companion object {
        private const val MAX_RETRIES = 3
    }
}
