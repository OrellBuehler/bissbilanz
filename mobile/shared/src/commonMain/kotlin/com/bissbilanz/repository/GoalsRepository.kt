package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class GoalsRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val appModeManager: AppModeManager,
) {
    fun goals(): Flow<Goals?> =
        db.userDataDatabaseQueries
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

    suspend fun goalsOnce(): Goals? =
        db.userDataDatabaseQueries
            .selectGoals()
            .executeAsOneOrNull()
            ?.let {
                Goals(
                    calorieGoal = it.calorieGoal,
                    proteinGoal = it.proteinGoal,
                    carbGoal = it.carbGoal,
                    fatGoal = it.fatGoal,
                    fiberGoal = it.fiberGoal,
                )
            }

    suspend fun refresh() {
        if (appModeManager.isLocal) return
        val goals = api.getGoals()
        if (goals != null) {
            cacheGoals(goals)
        }
    }

    suspend fun setGoals(goals: Goals): Goals {
        cacheGoals(goals)
        syncQueue.enqueue(SyncOperation.SetGoals(json.encodeToString(goals)))
        return goals
    }

    private fun cacheGoals(goals: Goals) {
        db.userDataDatabaseQueries.insertGoals(
            calorieGoal = goals.calorieGoal,
            proteinGoal = goals.proteinGoal,
            carbGoal = goals.carbGoal,
            fatGoal = goals.fatGoal,
            fiberGoal = goals.fiberGoal,
        )
        // SyncMeta lives in the cache database; written after the user-data write.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "goals",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }
}
