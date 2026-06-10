package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.migration.LocalDataMigrator
import com.bissbilanz.migration.MigrationState
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What the migration screen should show. */
sealed class MigrationUiState {
    data object Loading : MigrationUiState()

    /** The account already has data — the user must decide what to do with the local data. */
    data class Choice(
        val localItemCount: Int,
    ) : MigrationUiState()

    /** [step] is a stable key (see LocalDataMigrator.STEP_*). */
    data class InProgress(
        val done: Int,
        val total: Int,
        val step: String,
    ) : MigrationUiState()

    data class Failed(
        val message: String,
    ) : MigrationUiState()
}

/**
 * Drives the one-shot migration of local (anonymous) data after a sign-in from Local mode.
 *
 * On init: nothing local → flip straight to Synced; account already has data → ask the
 * user; otherwise start uploading immediately. Routing leaves this screen automatically
 * once the mode becomes [AppMode.SYNCED] (set by the migrator on success or by
 * [LocalDataMigrator.discardLocalData]).
 */
class MigrationViewModel(
    private val migrator: LocalDataMigrator,
    private val appModeManager: AppModeManager,
    private val authManager: AuthManager,
    private val refreshManager: RefreshManager,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private sealed class Phase {
        data object Deciding : Phase()

        data class Choice(
            val localItemCount: Int,
        ) : Phase()

        data object Migrating : Phase()

        data class PreflightFailed(
            val message: String,
        ) : Phase()
    }

    private val phase = MutableStateFlow<Phase>(Phase.Deciding)

    val uiState: StateFlow<MigrationUiState> =
        combine(phase, migrator.state) { phase, migrationState ->
            when (phase) {
                is Phase.Deciding -> {
                    MigrationUiState.Loading
                }

                is Phase.Choice -> {
                    MigrationUiState.Choice(phase.localItemCount)
                }

                is Phase.PreflightFailed -> {
                    MigrationUiState.Failed(phase.message)
                }

                is Phase.Migrating -> {
                    when (migrationState) {
                        is MigrationState.Running -> {
                            MigrationUiState.InProgress(migrationState.done, migrationState.total, migrationState.step)
                        }

                        is MigrationState.Failed -> {
                            MigrationUiState.Failed(migrationState.message)
                        }

                        // Idle: migrate() is about to start. Completed: the mode flips to
                        // Synced and the root routing leaves this screen.
                        is MigrationState.Idle, is MigrationState.Completed -> {
                            MigrationUiState.Loading
                        }
                    }
                }
            }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, MigrationUiState.Loading)

    init {
        decide()
    }

    private fun decide() {
        viewModelScope.launch {
            phase.value = Phase.Deciding
            val localItemCount = migrator.plan().total
            if (localItemCount == 0) {
                // Nothing to migrate — just continue as a regular synced account.
                appModeManager.setMode(AppMode.SYNCED)
                return@launch
            }
            try {
                if (migrator.serverHasData()) {
                    phase.value = Phase.Choice(localItemCount)
                } else {
                    startUpload()
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                phase.value = Phase.PreflightFailed(e.message ?: "Could not reach the server")
            }
        }
    }

    fun startUpload() {
        phase.value = Phase.Migrating
        viewModelScope.launch {
            migrator.migrate()
            if (migrator.state.value is MigrationState.Completed) {
                refreshManager.refreshAll()
            }
        }
    }

    /** Discards all local data (the UI confirms first) and continues with the account. */
    fun startFresh() {
        phase.value = Phase.Deciding
        viewModelScope.launch {
            migrator.discardLocalData()
            refreshManager.refreshAll()
        }
    }

    fun retry() {
        if (phase.value is Phase.Migrating) startUpload() else decide()
    }

    /** Abandons the sign-in: the mode stays Local, routing returns to the anonymous app. */
    fun cancelToLocal() {
        authManager.logout()
    }
}
