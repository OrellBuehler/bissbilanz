package com.bissbilanz.storage

import android.content.Context

/**
 * Plain (unencrypted) SharedPreferences. Deliberately not encrypted so the values
 * survive Android Auto Backup and device restores. Never store secrets here.
 */
actual class PlainStorage(
    context: Context,
) : KeyValueStore {
    private val prefs = context.getSharedPreferences("bissbilanz_app_prefs", Context.MODE_PRIVATE)

    actual override fun save(
        key: String,
        value: String,
    ) {
        prefs.edit().putString(key, value).apply()
    }

    actual override fun load(key: String): String? = prefs.getString(key, null)

    actual override fun delete(key: String) {
        prefs.edit().remove(key).apply()
    }
}
