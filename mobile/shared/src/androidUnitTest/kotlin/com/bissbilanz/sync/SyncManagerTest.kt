package com.bissbilanz.sync

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SyncManagerTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var connectivityProvider: ConnectivityProvider
    private lateinit var manager: SyncManager
    private val json = Json { ignoreUnknownKeys = true }
    private val isOnline = MutableStateFlow(true)

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
        syncQueue = SyncQueue(db, json)
        connectivityProvider = mockk()
        every { connectivityProvider.isOnline } returns isOnline
        manager = SyncManager(syncQueue, connectivityProvider, api, json, NoopErrorReporter())
    }

    @Test
    fun syncDrainsQueueAndExecutesEachOperation() =
        runTest {
            syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_1"))
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.createFood(any()) } returns TestFixtures.food()
            coEvery { api.deleteEntry("e1") } returns Unit

            val synced = manager.syncPendingQueue()

            assertEquals(2, synced)
            assertEquals(0, syncQueue.pendingCount())
            coVerify { api.createFood(match { it.name == "Rice" }) }
            coVerify { api.deleteEntry("e1") }
            assertTrue(
                manager.state.value.errors
                    .isEmpty(),
            )
        }

    @Test
    fun clientErrorDropsOperationAndRecordsError() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.deleteEntry("e1") } throws ApiException("bad request", 400)

            val synced = manager.syncPendingQueue()

            assertEquals(1, synced)
            assertEquals(0, syncQueue.pendingCount())
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("HTTP 400"),
            )
        }

    @Test
    fun serverErrorReleasesForRetryAndGivesUpAfterThreeRetries() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.deleteEntry("e1") } throws ApiException("server error", 500)

            assertEquals(0, manager.syncPendingQueue())
            assertEquals(1, syncQueue.pendingCount())
            assertEquals(0, manager.syncPendingQueue())
            assertEquals(1, syncQueue.pendingCount())
            val third = manager.syncPendingQueue()

            assertEquals(1, third)
            assertEquals(0, syncQueue.pendingCount())
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("Gave up"),
            )
            coVerify(exactly = 3) { api.deleteEntry("e1") }
        }

    @Test
    fun unauthorizedReleasesOperationsAndStopsSyncing() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            syncQueue.enqueue(SyncOperation.DeleteEntry("e2"))
            coEvery { api.deleteEntry(any()) } throws UnauthorizedException()

            val synced = manager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(2, syncQueue.pendingCount())
            coVerify(exactly = 1) { api.deleteEntry(any()) }
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("Session expired"),
            )
        }

    @Test
    fun offlineSkipsSyncAndKeepsQueue() =
        runTest {
            isOnline.value = false
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))

            val synced = manager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(1, syncQueue.pendingCount())
        }

    private fun foodCreate(name: String = "Rice") =
        FoodCreate(
            name = name,
            servingSize = 100.0,
            servingUnit = ServingUnit.g,
            calories = 130.0,
            protein = 2.7,
            carbs = 28.0,
            fat = 0.3,
            fiber = 0.4,
        )
}
