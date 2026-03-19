package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class GoalsRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
) {
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

    suspend fun goalsOnce(): Goals? =
        db.bissbilanzDatabaseQueries
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
