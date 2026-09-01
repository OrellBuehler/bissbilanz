package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

class PreferencesRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val appModeManager: AppModeManager,
) {
    fun preferences(): Flow<Preferences?> =
        db.userDataDatabaseQueries
            .selectPreferences()
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { cached ->
                cached?.let {
                    json.decodeOrNull<Preferences>(it.jsonData) ?: run {
                        db.userDataDatabaseQueries.deletePreferences()
                        null
                    }
                }
            }

    suspend fun refresh() {
        if (appModeManager.isLocal) return
        val prefs = api.getPreferences()
        cachePreferences(prefs)
    }

    /**
     * Reports the device's IANA timezone to the server so server-side analytics/MCP
     * bucket days/hours in the user's local tz. Only updates when it differs from the
     * stored value (loop guard); compares against the authoritative server value.
     */
    suspend fun reportTimeZone(deviceTimeZone: String) {
        if (appModeManager.isLocal) return
        val current = api.getPreferences()
        if (current.timeZone == deviceTimeZone) return
        updatePreferences(PreferencesUpdate(timeZone = deviceTimeZone))
    }

    suspend fun updatePreferences(update: PreferencesUpdate): Preferences {
        val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val current =
            cached?.let {
                json.decodeOrNull<Preferences>(it.jsonData) ?: run {
                    db.userDataDatabaseQueries.deletePreferences()
                    null
                }
            } ?: Preferences(
                showChartWidget = true,
                showFavoritesWidget = true,
                showSupplementsWidget = true,
                showWeightWidget = true,
                showMealBreakdownWidget = true,
                showTopFoodsWidget = true,
                showSleepWidget = true,
                widgetOrder = emptyList(),
                mealOrder = emptyList(),
                startPage = "dashboard",
                favoriteTapAction = "instant",
                favoriteMealAssignmentMode = "time_based",
                favoriteMealTimeframes = emptyList(),
                visibleNutrients = emptyList(),
                locale = null,
                timeZone = "UTC",
            )
        val updated = applyUpdate(current, update)
        cachePreferences(updated)
        syncQueue.enqueue(SyncOperation.UpdatePreferences(json.encodeToString(update)))
        return updated
    }

    private fun cachePreferences(prefs: Preferences) {
        db.userDataDatabaseQueries.insertPreferences(
            jsonData = json.encodeToString(prefs),
        )
        // SyncMeta lives in the cache database; written after the user-data write.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "preferences",
            lastSyncedAt = Clock.System.now().toString(),
        )
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
            showSleepWidget = update.showSleepWidget ?: current.showSleepWidget,
            widgetOrder = update.widgetOrder?.map { it.value } ?: current.widgetOrder,
            mealOrder = update.mealOrder ?: current.mealOrder,
            startPage = update.startPage?.value ?: current.startPage,
            favoriteTapAction = update.favoriteTapAction?.value ?: current.favoriteTapAction,
            favoriteMealAssignmentMode = update.favoriteMealAssignmentMode?.value ?: current.favoriteMealAssignmentMode,
            favoriteMealTimeframes = current.favoriteMealTimeframes,
            visibleNutrients = update.visibleNutrients ?: current.visibleNutrients,
            locale = update.locale?.value ?: current.locale,
            timeZone = update.timeZone ?: current.timeZone,
        )
}
