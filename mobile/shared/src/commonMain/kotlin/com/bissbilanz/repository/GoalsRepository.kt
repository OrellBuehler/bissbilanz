package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Goals
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class GoalsRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    fun goals(): Flow<Goals?> =
        db.bissbilanzDatabaseQueries
            .selectGoals()
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { cached ->
                cached?.let {
                    Goals(
                        calorieGoal = it.calorieGoal,
                        proteinGoal = it.proteinGoal,
                        carbGoal = it.carbGoal,
                        fatGoal = it.fatGoal,
                        fiberGoal = it.fiberGoal,
                    )
                }
            }

    suspend fun refresh() {
        try {
            val goals = api.getGoals()
            if (goals != null) {
                cacheGoals(goals)
            }
        } catch (_: Exception) {
        }
    }

    suspend fun setGoals(goals: Goals): Goals {
        if (!connectivity.isOnline.value) {
            val url = "/api/goals"
            val body = json.encodeToString(goals)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            cacheGoals(goals)
            return goals
        }
        val updated = api.setGoals(goals)
        cacheGoals(updated)
        return updated
    }

    private fun cacheGoals(goals: Goals) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.insertGoals(
                calorieGoal = goals.calorieGoal,
                proteinGoal = goals.proteinGoal,
                carbGoal = goals.carbGoal,
                fatGoal = goals.fatGoal,
                fiberGoal = goals.fiberGoal,
            )
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "goals",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }
}
