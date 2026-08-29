package com.bissbilanz.android.sync

import androidx.annotation.StringRes
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.sync.SyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Drives the "keep my data on this device" downgrade.
 *
 * A singleton on an application-scoped coroutine, deliberately not a ViewModel:
 * the flow downloads the whole account and then deletes it server-side, so it
 * must survive the user leaving the Settings screen. Keeping the state here too
 * means a returning screen sees the run still in progress instead of an Idle
 * dialog it could start a second, concurrent deletion from.
 */
class AccountDowngradeController(
    private val accountDowngrader: AccountDowngrader,
    private val syncManager: SyncManager,
    private val errorReporter: ErrorReporter,
    private val scope: CoroutineScope,
) {
    sealed interface State {
        data object Idle : State

        data object Syncing : State

        data object Downloading : State

        data object Deleting : State

        data object Done : State

        data class Failed(
            @StringRes val messageRes: Int,
        ) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    fun start() {
        val current = _state.value
        if (current != State.Idle && current !is State.Failed) return
        _state.value = State.Syncing
        scope.launch {
            try {
                if (!drainSyncQueue()) {
                    _state.value = State.Failed(R.string.settings_downgrade_error_pending)
                    return@launch
                }
                _state.value = State.Downloading
                accountDowngrader.downloadAll()
                _state.value = State.Deleting
                accountDowngrader.finalize()
                _state.value = State.Done
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _state.value = State.Failed(R.string.settings_downgrade_error_failed)
            }
        }
    }

    fun reset() {
        val current = _state.value
        if (current == State.Done || current is State.Failed) _state.value = State.Idle
    }

    /**
     * Empties the sync queue, or gives up. One pass uploads at most a drain's
     * worth of operations (and skips ops still in backoff), so a device that was
     * offline for a while needs several — but an op that never uploads must not
     * spin here forever, hence "stop as soon as a pass makes no progress".
     */
    private suspend fun drainSyncQueue(): Boolean {
        var pending = accountDowngrader.pendingOps()
        while (pending > 0L) {
            syncManager.syncPendingQueue()
            val remaining = accountDowngrader.pendingOps()
            if (remaining >= pending) return false
            pending = remaining
        }
        return true
    }
}
