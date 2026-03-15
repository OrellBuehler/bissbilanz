package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.Dispatchers
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
                cached?.let { json.decodeFromString<Preferences>(it.jsonData) }
            }

    suspend fun refresh() {
        try {
            val prefs = api.getPreferences()
            cachePreferences(prefs)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun updatePreferences(update: PreferencesUpdate): Preferences {
        val cached = db.bissbilanzDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val current = cached?.let { json.decodeFromString<Preferences>(it.jsonData) } ?: Preferences()
        val updated = applyUpdate(current, update)
        cachePreferences(updated)
        val url = "/api/preferences"
        val body = json.encodeToString(update)
        val meta = urlToMeta(url)
        syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
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
