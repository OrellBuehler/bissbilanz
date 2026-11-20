package com.bissbilanz.android.navigation

import android.content.Context
import android.content.SharedPreferences

/** The device-local bottom bar setup: which tabs, in what order, and where the app opens. */
class NavTabPrefs(
    context: Context,
) {
    val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class Config(
        val tabs: List<String>,
        val landing: String?,
    )

    fun read(): Config = Config(tabs(), prefs.getString(KEY_LANDING, null))

    /** Migrates the old unordered set into the ordered list the first time it is read. */
    fun tabs(): List<String> {
        val stored = prefs.getString(KEY_TABS, null)
        val legacy = prefs.getStringSet(KEY_LEGACY_TABS, null)
        val tabs = NavTabs.load(stored, legacy)
        if (stored == null && legacy != null) setTabs(tabs)
        return tabs
    }

    fun setTabs(ids: List<String>) {
        prefs.edit().putString(KEY_TABS, NavTabs.serialize(ids)).apply()
    }

    fun setLanding(id: String) {
        prefs.edit().putString(KEY_LANDING, id).apply()
    }

    companion object {
        const val PREFS_NAME = "nav_tabs"
        const val KEY_TABS = "tab_order"
        const val KEY_LEGACY_TABS = "selected_tabs"
        const val KEY_LANDING = "landing_tab"
    }
}
