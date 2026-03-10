package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Goals
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock

class GoalsRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
) {
    private val _goals = MutableStateFlow<Goals?>(null)
    val goals: StateFlow<Goals?> = _goals.asStateFlow()

    suspend fun loadGoals() {
        try {
            val goals = api.getGoals()
            if (goals != null) {
                cacheGoals(goals)
            }
            _goals.value = goals
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectGoals().executeAsOneOrNull()
            if (cached != null) {
                _goals.value =
                    Goals(
                        calorieGoal = cached.calorieGoal,
                        proteinGoal = cached.proteinGoal,
                        carbGoal = cached.carbGoal,
                        fatGoal = cached.fatGoal,
                        fiberGoal = cached.fiberGoal,
                    )
            } else {
                throw e
            }
        }
    }

    suspend fun setGoals(goals: Goals): Goals {
        val updated = api.setGoals(goals)
        cacheGoals(updated)
        _goals.value = updated
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
