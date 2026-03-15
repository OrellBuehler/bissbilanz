package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.Goals
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class GoalsRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var connectivity: ConnectivityProvider
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: GoalsRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db =
            mockk {
                every { bissbilanzDatabaseQueries } returns queries
            }
        connectivity =
            mockk {
                every { isOnline } returns MutableStateFlow(true)
            }
        syncQueue = mockk(relaxed = true)
        repository = GoalsRepository(api, db, connectivity, syncQueue)
    }

    @Test
    fun refreshCachesGoalsOnSuccess() =
        runTest {
            val goals = TestFixtures.goals()
            coEvery { api.getGoals() } returns goals

            repository.refresh()

            coVerify { queries.transaction(any(), any()) }
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
            coEvery { api.setGoals(goals) } returns goals

            val result = repository.setGoals(goals)

            assertEquals(goals, result)
            coVerify { queries.transaction(any(), any()) }
        }

    @Test
    fun setGoalsCallsApiWithCorrectValues() =
        runTest {
            val goals =
                Goals(
                    calorieGoal = 1800.0,
                    proteinGoal = 130.0,
                    carbGoal = 200.0,
                    fatGoal = 55.0,
                    fiberGoal = 25.0,
                )
            coEvery { api.setGoals(goals) } returns goals

            repository.setGoals(goals)

            coVerify { api.setGoals(goals) }
        }
}
