package com.bissbilanz.android.bulk

import android.content.Context
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.jwtSubject
import com.bissbilanz.foodpackage.BulkUploadCounts
import com.bissbilanz.foodpackage.BulkUploadStore
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * What the UI can do to the background upload of bulk-imported foods: watch it, pause and
 * resume it, limit it to Wi-Fi, retry what the server rejected.
 */
class BulkUploadController(
    private val context: Context,
    private val store: BulkUploadStore,
    private val preferences: BulkUploadPreferences,
    private val authManager: AuthManager,
    private val appModeManager: AppModeManager,
) {
    val counts: Flow<BulkUploadCounts> get() = store.countsFlow()
    val paused: StateFlow<Boolean> get() = preferences.paused
    val wifiOnly: StateFlow<Boolean> get() = preferences.wifiOnly

    /** The upload only exists in an account; in Local mode foods stay on the device. */
    val isAvailable: Boolean get() = !appModeManager.isLocal

    fun pause() {
        preferences.setPaused(true)
        BulkUploadWorker.cancel(context)
    }

    fun resume() {
        preferences.setPaused(false)
        BulkUploadWorker.enqueue(context, preferences.wifiOnly.value)
    }

    fun setWifiOnly(value: Boolean) {
        preferences.setWifiOnly(value)
        if (!preferences.paused.value && store.counts().pending > 0) {
            BulkUploadWorker.enqueue(context, value, androidx.work.ExistingWorkPolicy.REPLACE)
        }
    }

    suspend fun retryFailed() {
        val userId = jwtSubject(authManager.getAccessToken()) ?: return
        store.retryFailed(userId)
        resume()
    }
}
