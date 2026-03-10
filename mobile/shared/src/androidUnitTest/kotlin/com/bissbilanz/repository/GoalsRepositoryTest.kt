package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.Goals
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.test.runTest

class GoalsRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var repository: GoalsRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db = mockk {
            every { bissbilanzDatabaseQueries } returns queries
        }
        repository = GoalsRepository(api, db)
    }

    @Test
    fun loadGoalsUpdatesStateFlowOnSuccess() = runTest {
        val goals = testGoals()
        coEvery { api.getGoals() } returns goals

        repository.loadGoals()

        assertEquals(goals, repository.goals.value)
    }

    @Test
    fun loadGoalsSetsNullWhenApiReturnsNull() = runTest {
        coEvery { api.getGoals() } returns null

        repository.loadGoals()

        assertNull(repository.goals.value)
    }

    @Test
    fun setGoalsUpdatesStateFlowAndCaches() = runTest {
        val goals = testGoals()
        coEvery { api.setGoals(goals) } returns goals

        val result = repository.setGoals(goals)

        assertEquals(goals, result)
        assertEquals(goals, repository.goals.value)
        coVerify { queries.transaction(any(), any()) }
    }

    @Test
    fun goalsStateFlowStartsNull() {
        assertNull(repository.goals.value)
    }

    @Test
    fun setGoalsCallsApiWithCorrectValues() = runTest {
        val goals = Goals(
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

    companion object {
        fun testGoals() = Goals(
            calorieGoal = 2000.0,
            proteinGoal = 150.0,
            carbGoal = 250.0,
            fatGoal = 65.0,
            fiberGoal = 30.0,
        )
    }
}
