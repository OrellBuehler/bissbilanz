package com.bissbilanz.repository

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DayPropertiesRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
    }

    private fun repository(
        mode: AppMode?,
        syncQueue: SyncQueue,
    ): EntryRepository =
        EntryRepository(
            api,
            db,
            mockk<HealthSyncService>(relaxed = true),
            syncQueue,
            json,
            NoopErrorReporter(),
            appModeManager(mode),
        )

    @Test
    fun localModeSetGetDeleteRoundTripsViaCacheWithEmptyQueue() =
        runTest {
            val localMode = appModeManager(AppMode.LOCAL)
            val syncQueue = SyncQueue(db, json, localMode)
            val repo = repository(AppMode.LOCAL, syncQueue)

            // Strict api mock: any API call would fail the test.
            assertNull(repo.getDayProperties("2024-01-15"))

            val set = repo.setDayProperties("2024-01-15", isFastingDay = true)
            assertEquals(DayProperties(date = "2024-01-15", isFastingDay = true), set)
            assertEquals(set, repo.getDayProperties("2024-01-15"))

            repo.deleteDayProperties("2024-01-15")
            assertNull(repo.getDayProperties("2024-01-15"))

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun syncedSetEnqueuesSetDayProperties() =
        runTest {
            val syncQueue = SyncQueue(db, json, appModeManager(AppMode.SYNCED))
            val repo = repository(AppMode.SYNCED, syncQueue)

            repo.setDayProperties("2024-01-15", isFastingDay = true)

            val queued = syncQueue.findByAffected("day_properties", "2024-01-15")
            val op = queued.single().operation as SyncOperation.SetDayProperties
            assertEquals("2024-01-15", op.date)
            assertTrue(op.isFastingDay)
        }

    @Test
    fun syncedDeleteEnqueuesDeleteDayProperties() =
        runTest {
            val syncQueue = SyncQueue(db, json, appModeManager(AppMode.SYNCED))
            val repo = repository(AppMode.SYNCED, syncQueue)

            repo.deleteDayProperties("2024-01-15")

            val queued = syncQueue.findByAffected("day_properties", "2024-01-15")
            val op = queued.single().operation as SyncOperation.DeleteDayProperties
            assertEquals("2024-01-15", op.date)
        }

    @Test
    fun syncedGetCachesApiResultAndFallsBackToCacheOnError() =
        runTest {
            val syncQueue = SyncQueue(db, json, appModeManager(AppMode.SYNCED))
            val repo = repository(AppMode.SYNCED, syncQueue)
            coEvery { api.getDayProperties("2024-01-15") } returns
                DayProperties(date = "2024-01-15", isFastingDay = true)

            val fromApi = repo.getDayProperties("2024-01-15")
            assertEquals(true, fromApi?.isFastingDay)

            coEvery { api.getDayProperties("2024-01-15") } throws RuntimeException("offline")
            val fromCache = repo.getDayProperties("2024-01-15")
            assertEquals(true, fromCache?.isFastingDay)
        }
}
