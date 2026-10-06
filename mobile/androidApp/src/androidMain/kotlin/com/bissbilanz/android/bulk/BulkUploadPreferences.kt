package com.bissbilanz.android.bulk

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Device-local choices for the background upload of bulk-imported foods: whether it is paused
 * and whether it may use mobile data. Not synced and not backed up: both are about this phone's
 * connection, not about the account.
 */
class BulkUploadPreferences(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("bulk_upload", Context.MODE_PRIVATE)

    private val _paused = MutableStateFlow(prefs.getBoolean(KEY_PAUSED, false))
    val paused: StateFlow<Boolean> = _paused.asStateFlow()

    private val _wifiOnly = MutableStateFlow(prefs.getBoolean(KEY_WIFI_ONLY, false))
    val wifiOnly: StateFlow<Boolean> = _wifiOnly.asStateFlow()

    fun setPaused(value: Boolean) {
        prefs.edit().putBoolean(KEY_PAUSED, value).apply()
        _paused.value = value
    }

    fun setWifiOnly(value: Boolean) {
        prefs.edit().putBoolean(KEY_WIFI_ONLY, value).apply()
        _wifiOnly.value = value
    }

    private companion object {
        const val KEY_PAUSED = "paused"
        const val KEY_WIFI_ONLY = "wifi_only"
    }
}
