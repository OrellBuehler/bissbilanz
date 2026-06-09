package com.bissbilanz.mode

import com.bissbilanz.storage.KeyValueStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * How the app stores and syncs data.
 *
 * - [LOCAL]: anonymous, no backend. The local SQLite database is the primary store;
 *   nothing is ever enqueued for sync and refresh calls are no-ops.
 * - [SYNCED]: logged in. The backend is the source of truth; the local database is an
 *   offline cache and writes are queued for upload.
 */
enum class AppMode {
    LOCAL,
    SYNCED,
}

/**
 * Holds the persisted app mode. A `null` mode means the user has not chosen yet —
 * this is also the state for existing logged-in installs after an upgrade, which must
 * keep behaving exactly as before. Therefore anything other than [AppMode.LOCAL]
 * (including `null`) is treated as "sync allowed".
 */
class AppModeManager(
    private val storage: KeyValueStore,
) {
    private val _mode = MutableStateFlow<AppMode?>(null)
    val mode: StateFlow<AppMode?> = _mode.asStateFlow()

    val isLocal: Boolean get() = mode.value == AppMode.LOCAL

    /** Loads the persisted mode. Call once at app startup, before any sync starts. */
    fun initialize() {
        val stored = storage.load(KEY_APP_MODE)
        _mode.value = AppMode.entries.firstOrNull { it.name == stored }
    }

    fun setMode(mode: AppMode) {
        storage.save(KEY_APP_MODE, mode.name)
        _mode.value = mode
    }

    /** Clears the persisted mode (used on logout) and emits `null`. */
    fun clear() {
        storage.delete(KEY_APP_MODE)
        _mode.value = null
    }

    companion object {
        private const val KEY_APP_MODE = "app_mode"
    }
}
