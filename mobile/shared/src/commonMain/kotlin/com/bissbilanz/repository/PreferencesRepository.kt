package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.ClaudeCapability
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.PreferencesField
import com.bissbilanz.util.decodePreferencesOrNull
import com.bissbilanz.util.jsonKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
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
                    json.decodePreferencesOrNull(it.jsonData) ?: run {
                        withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deletePreferences() }
                        null
                    }
                }
            }

    private val _claudeCapability = MutableStateFlow<ClaudeCapability?>(null)

    /**
     * Whether server-side Claude can run for this account. Only the preferences GET
     * carries it, so it is kept in memory and refreshed with them; null means unknown
     * and is treated as unavailable.
     */
    val claudeCapability: StateFlow<ClaudeCapability?> = _claudeCapability.asStateFlow()

    private var accountGeneration = 0

    /**
     * Called on sign-out and account switches so one account's capability never shows for
     * the next. A refresh already in flight belongs to the previous account and is dropped
     * when it lands.
     */
    fun clearClaudeCapability() {
        accountGeneration++
        _claudeCapability.value = null
    }

    suspend fun refresh() {
        if (appModeManager.isLocal) {
            _claudeCapability.value = null
            return
        }
        val generation = accountGeneration
        val response = api.getPreferencesResponse()
        if (generation != accountGeneration) return
        _claudeCapability.value = response.claude
        // A preferences edit still waiting to upload is newer than what the server holds.
        if (syncQueue.hasPending("preferences")) return
        withContext(Dispatchers.IO) { cachePreferences(response.preferences) }
    }

    /**
     * Reports the device's IANA timezone to the server so server-side analytics/MCP
     * bucket days/hours in the user's local tz. Only updates when it differs from the
     * stored value (loop guard); compares against the authoritative server value.
     */
    suspend fun reportTimeZone(deviceTimeZone: String) {
        if (appModeManager.isLocal) return
        val generation = accountGeneration
        val response = api.getPreferencesResponse()
        if (generation != accountGeneration) return
        _claudeCapability.value = response.claude
        val current = response.preferences
        if (current.timeZone == deviceTimeZone) return
        updatePreferences(PreferencesUpdate(timeZone = deviceTimeZone))
    }

    /**
     * [cleared] names the settings the user reset to "not set". [PreferencesUpdate]
     * encodes both "unchanged" and "cleared" as null, so without it choosing the empty
     * option is silently dropped on the wire and in the cache. See
     * `com.bissbilanz.util.PartialUpdate`.
     */
    suspend fun updatePreferences(
        update: PreferencesUpdate,
        cleared: Set<PreferencesField> = emptySet(),
    ): Preferences {
        val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val current =
            cached?.let {
                json.decodePreferencesOrNull(it.jsonData) ?: run {
                    withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deletePreferences() }
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
                showFastingWidget = true,
                showDayPropertiesWidget = true,
                showWaterWidget = true,
                showActivityWidget = true,
                showNotesWidget = true,
                showRecipeSuggestionsWidget = true,
                widgetOrder = emptyList(),
                mealOrder = emptyList(),
                startPage = "dashboard",
                favoriteTapAction = "instant",
                favoriteMealAssignmentMode = "time_based",
                favoriteMealTimeframes = emptyList(),
                visibleNutrients = emptyList(),
                waterGoalMl = 2000,
                locale = null,
                timeZone = "UTC",
                activityGoalAdjustment = false,
                activityCreditPercent = 100,
                aiTaskProcessor = Preferences.AiTaskProcessor.assistant,
                aiTaskAutoLog = false,
            )
        val updated = applyUpdate(current, update, cleared)
        withContext(Dispatchers.IO) { cachePreferences(updated) }
        syncQueue.enqueue(SyncOperation.UpdatePreferences(json.encodeToString(update), cleared.jsonKeys()))
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
        cleared: Set<PreferencesField>,
    ): Preferences =
        current.copy(
            showChartWidget = update.showChartWidget ?: current.showChartWidget,
            showFavoritesWidget = update.showFavoritesWidget ?: current.showFavoritesWidget,
            showSupplementsWidget = update.showSupplementsWidget ?: current.showSupplementsWidget,
            showWeightWidget = update.showWeightWidget ?: current.showWeightWidget,
            showMealBreakdownWidget = update.showMealBreakdownWidget ?: current.showMealBreakdownWidget,
            showTopFoodsWidget = update.showTopFoodsWidget ?: current.showTopFoodsWidget,
            showSleepWidget = update.showSleepWidget ?: current.showSleepWidget,
            showFastingWidget = update.showFastingWidget ?: current.showFastingWidget,
            showDayPropertiesWidget = update.showDayPropertiesWidget ?: current.showDayPropertiesWidget,
            showWaterWidget = update.showWaterWidget ?: update.showDayPropertiesWidget ?: current.showWaterWidget,
            showActivityWidget = update.showActivityWidget ?: update.showDayPropertiesWidget ?: current.showActivityWidget,
            showNotesWidget = update.showNotesWidget ?: update.showDayPropertiesWidget ?: current.showNotesWidget,
            showRecipeSuggestionsWidget = update.showRecipeSuggestionsWidget ?: current.showRecipeSuggestionsWidget,
            widgetOrder = update.widgetOrder?.map { it.value } ?: current.widgetOrder,
            mealOrder = update.mealOrder ?: current.mealOrder,
            startPage = update.startPage?.value ?: current.startPage,
            favoriteTapAction = update.favoriteTapAction?.value ?: current.favoriteTapAction,
            favoriteMealAssignmentMode = update.favoriteMealAssignmentMode?.value ?: current.favoriteMealAssignmentMode,
            favoriteMealTimeframes = current.favoriteMealTimeframes,
            visibleNutrients = update.visibleNutrients ?: current.visibleNutrients,
            locale = update.locale?.value ?: current.locale,
            timeZone = update.timeZone ?: current.timeZone,
            waterGoalMl = update.waterGoalMl ?: current.waterGoalMl,
            activityGoalAdjustment = update.activityGoalAdjustment ?: current.activityGoalAdjustment,
            activityCreditPercent = update.activityCreditPercent ?: current.activityCreditPercent,
            aiTaskProcessor =
                update.aiTaskProcessor?.let {
                    when (it) {
                        PreferencesUpdate.AiTaskProcessor.assistant -> Preferences.AiTaskProcessor.assistant
                        PreferencesUpdate.AiTaskProcessor.device -> Preferences.AiTaskProcessor.device
                        PreferencesUpdate.AiTaskProcessor.claude -> Preferences.AiTaskProcessor.assistant
                    }
                } ?: current.aiTaskProcessor,
            aiTaskProcessorKind = update.aiTaskProcessor?.value ?: current.aiTaskProcessorKind,
            aiTaskAutoLog = update.aiTaskAutoLog ?: current.aiTaskAutoLog,
            biologicalSex =
                if (PreferencesField.BIOLOGICAL_SEX in cleared) {
                    null
                } else {
                    update.biologicalSex?.let {
                        when (it) {
                            PreferencesUpdate.BiologicalSex.male -> Preferences.BiologicalSex.male
                            PreferencesUpdate.BiologicalSex.female -> Preferences.BiologicalSex.female
                        }
                    } ?: current.biologicalSex
                },
        )
}
