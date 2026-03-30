package com.bissbilanz.repository

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EntryRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var healthSync: HealthSyncService
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: EntryRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
        healthSync = mockk(relaxed = true)
        syncQueue = mockk(relaxed = true)
        repository = EntryRepository(api, db, healthSync, syncQueue, json, NoopErrorReporter())
    }

    @Test
    fun refreshCachesDataOnSuccess() =
        runTest {
            val entries = listOf(TestFixtures.entry(id = "1"), TestFixtures.entry(id = "2"))
            coEvery { api.getEntries("2024-01-15") } returns entries

            repository.refresh("2024-01-15")

            coVerify { api.getEntries("2024-01-15") }
        }

    @Test
    fun refreshThrowsOnFailure() =
        runTest {
            coEvery { api.getEntries("2024-01-15") } throws RuntimeException("Network error")

            try {
                repository.refresh("2024-01-15")
                assertTrue(false, "Should have thrown")
            } catch (e: RuntimeException) {
                assertEquals("Network error", e.message)
            }
        }

    @Test
    fun createEntrySavesLocallyAndEnqueuesSync() =
        runTest {
            val create =
                EntryCreate(
                    foodId = "f1",
                    mealType = "lunch",
                    servings = 1.0,
                    date = "2024-01-15",
                )

            val result = repository.createEntry(create)

            assertTrue(result.id.startsWith("temp_"))
            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.CreateEntry }) }
        }
}
