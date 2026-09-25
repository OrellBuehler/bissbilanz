package com.bissbilanz.android.tips

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Every tip's stable id, used both as its dismissal key and its display priority. */
object TipIds {
    const val DASHBOARD_LAYOUT = "dashboard_layout"
    const val SCANNING = "scanning"
    const val FAVORITES = "favorites"
    const val WIDGETS = "widgets"
    const val HEALTH_CONNECT_WEIGHT = "health_connect_weight"
    const val HEALTH_CONNECT_SLEEP = "health_connect_sleep"
}

/**
 * Tracks which contextual tips (see `AnchoredTip`/`HintCard`) the user has already
 * dismissed, plus a running count of successful food logs that gates the tips tied to
 * usage rather than a screen visit. Styled like [com.bissbilanz.android.health.HealthSyncPreferences]:
 * a small SharedPreferences wrapper, injected as a Koin singleton.
 */
class TipStore(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("bissbilanz_tips", Context.MODE_PRIVATE)

    private val _dismissedIds =
        MutableStateFlow(prefs.getStringSet(KEY_DISMISSED, emptySet())?.toSet() ?: emptySet())
    val dismissedIds: StateFlow<Set<String>> = _dismissedIds.asStateFlow()

    private val _foodLoggedCount = MutableStateFlow(prefs.getInt(KEY_FOOD_LOGGED, 0))
    val foodLoggedCount: StateFlow<Int> = _foodLoggedCount.asStateFlow()

    fun isDismissed(id: String): Boolean = id in _dismissedIds.value

    fun dismiss(id: String) {
        if (id in _dismissedIds.value) return
        val updated = _dismissedIds.value + id
        _dismissedIds.value = updated
        prefs.edit().putStringSet(KEY_DISMISSED, updated).apply()
    }

    fun incrementFoodLogged() {
        val updated = _foodLoggedCount.value + 1
        _foodLoggedCount.value = updated
        prefs.edit().putInt(KEY_FOOD_LOGGED, updated).apply()
    }

    /**
     * Clears every dismissal so eligible tips reappear right away, for the Settings
     * "Show tips again" row. The food-logged count is left alone — it is usage history,
     * not tip state, and wiping it would delay usage-gated tips instead of bringing
     * them back immediately.
     */
    fun resetAll() {
        _dismissedIds.value = emptySet()
        prefs.edit().remove(KEY_DISMISSED).apply()
    }

    private companion object {
        const val KEY_DISMISSED = "dismissed_ids"
        const val KEY_FOOD_LOGGED = "food_logged_count"
    }
}
