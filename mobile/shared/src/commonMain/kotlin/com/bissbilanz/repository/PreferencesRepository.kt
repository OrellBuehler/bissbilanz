package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class PreferencesRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
) {
    private val _preferences = MutableStateFlow<Preferences?>(null)
    val preferences: StateFlow<Preferences?> = _preferences.asStateFlow()

    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    suspend fun loadPreferences() {
        try {
            val prefs = api.getPreferences()
            cachePreferences(prefs)
            _preferences.value = prefs
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectPreferences().executeAsOneOrNull()
            if (cached != null) {
                _preferences.value = json.decodeFromString<Preferences>(cached.jsonData)
            } else {
                throw e
            }
        }
    }

    suspend fun updatePreferences(update: PreferencesUpdate): Preferences {
        if (!connectivity.isOnline.value) {
            val url = "/api/preferences"
            val body = json.encodeToString(update)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            // Apply optimistically
            val current = _preferences.value ?: Preferences()
            val updated = applyUpdate(current, update)
            cachePreferences(updated)
            _preferences.value = updated
            return updated
        }
        val updated = api.updatePreferences(update)
        cachePreferences(updated)
        _preferences.value = updated
        return updated
    }

    private fun cachePreferences(prefs: Preferences) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.insertPreferences(
                jsonData = json.encodeToString(prefs),
            )
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "preferences",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    private fun applyUpdate(
        current: Preferences,
        update: PreferencesUpdate,
    ): Preferences =
        current.copy(
            showChartWidget = update.showChartWidget ?: current.showChartWidget,
            showFavoritesWidget = update.showFavoritesWidget ?: current.showFavoritesWidget,
            showSupplementsWidget = update.showSupplementsWidget ?: current.showSupplementsWidget,
            showWeightWidget = update.showWeightWidget ?: current.showWeightWidget,
            showMealBreakdownWidget = update.showMealBreakdownWidget ?: current.showMealBreakdownWidget,
            showTopFoodsWidget = update.showTopFoodsWidget ?: current.showTopFoodsWidget,
            widgetOrder = update.widgetOrder ?: current.widgetOrder,
            startPage = update.startPage ?: current.startPage,
            favoriteTapAction = update.favoriteTapAction ?: current.favoriteTapAction,
            favoriteMealAssignmentMode = update.favoriteMealAssignmentMode ?: current.favoriteMealAssignmentMode,
            favoriteMealTimeframes = update.favoriteMealTimeframes ?: current.favoriteMealTimeframes,
            visibleNutrients = update.visibleNutrients ?: current.visibleNutrients,
            locale = update.locale ?: current.locale,
        )
}
