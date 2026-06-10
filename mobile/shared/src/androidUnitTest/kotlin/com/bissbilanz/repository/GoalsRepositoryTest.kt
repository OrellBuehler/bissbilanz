package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Goals
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class GoalsRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: GoalsRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = mockk(relaxed = true)
        repository = GoalsRepository(api, db, cacheDb, syncQueue, json, appModeManager())
    }

    @Test
    fun goalsOnceReturnsNullWhenCacheEmpty() =
        runTest {
            val result = repository.goalsOnce()
            assertEquals(null, result)
        }

    @Test
    fun refreshCachesGoalsOnSuccess() =
        runTest {
            val goals = TestFixtures.goals()
            coEvery { api.getGoals() } returns goals

            repository.refresh()

            val cached = repository.goalsOnce()
            assertEquals(goals, cached)
        }

    @Test
    fun refreshDoesNotThrowWhenApiReturnsNull() =
        runTest {
            coEvery { api.getGoals() } returns null

            repository.refresh()
        }

    @Test
    fun setGoalsCachesAndReturns() =
        runTest {
            val goals = TestFixtures.goals()

            val result = repository.setGoals(goals)

            assertEquals(goals, result)
            val cached = repository.goalsOnce()
            assertEquals(goals, cached)
        }

    @Test
    fun setGoalsEnqueuesSyncOperation() =
        runTest {
            val goals =
                Goals(
                    calorieGoal = 1800.0,
                    proteinGoal = 130.0,
                    carbGoal = 200.0,
                    fatGoal = 55.0,
                    fiberGoal = 25.0,
                )

            repository.setGoals(goals)

            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.SetGoals }) }
        }
}
