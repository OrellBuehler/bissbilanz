package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class PreferencesRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
) {
    fun preferences(): Flow<Preferences?> =
        db.bissbilanzDatabaseQueries
            .selectPreferences()
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { cached ->
                cached?.let {
                    json.decodeOrNull<Preferences>(it.jsonData) ?: run {
                        db.bissbilanzDatabaseQueries.deletePreferences()
                        null
                    }
                }
            }

    suspend fun refresh() {
        val prefs = api.getPreferences()
        cachePreferences(prefs)
    }

    suspend fun updatePreferences(update: PreferencesUpdate): Preferences {
        val cached = db.bissbilanzDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val current =
            cached?.let {
                json.decodeOrNull<Preferences>(it.jsonData) ?: run {
                    db.bissbilanzDatabaseQueries.deletePreferences()
                    null
                }
            } ?: Preferences(
                showChartWidget = true,
                showFavoritesWidget = true,
                showSupplementsWidget = true,
                showWeightWidget = true,
                showMealBreakdownWidget = true,
                showTopFoodsWidget = true,
                widgetOrder = emptyList(),
                startPage = "dashboard",
                favoriteTapAction = "instant",
                favoriteMealAssignmentMode = "time_based",
                favoriteMealTimeframes = emptyList(),
                visibleNutrients = emptyList(),
                locale = null,
            )
        val updated = applyUpdate(current, update)
        cachePreferences(updated)
        syncQueue.enqueue(SyncOperation.UpdatePreferences(json.encodeToString(update)))
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
            widgetOrder = update.widgetOrder?.map { it.value } ?: current.widgetOrder,
            startPage = update.startPage?.value ?: current.startPage,
            favoriteTapAction = update.favoriteTapAction?.value ?: current.favoriteTapAction,
            favoriteMealAssignmentMode = update.favoriteMealAssignmentMode?.value ?: current.favoriteMealAssignmentMode,
            favoriteMealTimeframes = current.favoriteMealTimeframes,
            visibleNutrients = update.visibleNutrients ?: current.visibleNutrients,
            locale = update.locale?.value ?: current.locale,
        )
}
