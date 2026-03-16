package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.Goals
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.TestFixtures
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class GoalsRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: GoalsRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db =
            mockk {
                every { bissbilanzDatabaseQueries } returns queries
            }
        syncQueue = mockk(relaxed = true)
        repository = GoalsRepository(api, db, syncQueue, json)
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
            io.mockk.coEvery { api.getGoals() } returns goals

            repository.refresh()

            coVerify { queries.transaction(any(), any()) }
        }

    @Test
    fun refreshDoesNotThrowWhenApiReturnsNull() =
        runTest {
            io.mockk.coEvery { api.getGoals() } returns null

            repository.refresh()
        }

    @Test
    fun setGoalsCachesAndReturns() =
        runTest {
            val goals = TestFixtures.goals()

            val result = repository.setGoals(goals)

            assertEquals(goals, result)
            coVerify { queries.transaction(any(), any()) }
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
