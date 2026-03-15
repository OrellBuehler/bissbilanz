package com.bissbilanz.repository

import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.EntryCreate
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

class EntryRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var healthSync: HealthSyncService
    private lateinit var connectivity: ConnectivityProvider
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: EntryRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db =
            mockk {
                every { bissbilanzDatabaseQueries } returns queries
            }
        healthSync = mockk(relaxed = true)
        connectivity =
            mockk {
                every { isOnline } returns MutableStateFlow(true)
            }
        syncQueue = mockk(relaxed = true)
        repository = EntryRepository(api, db, healthSync, connectivity, syncQueue)
    }

    @Test
    fun refreshCachesDataOnSuccess() =
        runTest {
            val entries = listOf(TestFixtures.entry(id = "1"), TestFixtures.entry(id = "2"))
            coEvery { api.getEntries("2024-01-15") } returns entries

            repository.refresh("2024-01-15")

            coVerify { queries.transaction(any(), any()) }
        }

    @Test
    fun refreshDoesNotThrowOnFailure() =
        runTest {
            coEvery { api.getEntries("2024-01-15") } throws RuntimeException("Network error")

            repository.refresh("2024-01-15")
        }

    @Test
    fun deleteEntryCallsApiAndDatabase() =
        runTest {
            coEvery { api.deleteEntry("1") } returns Unit

            repository.deleteEntry("1")

            coVerify { api.deleteEntry("1") }
            coVerify { queries.deleteEntry("1") }
        }

    @Test
    fun createEntryCallsApiAndRefreshes() =
        runTest {
            val create =
                EntryCreate(
                    foodId = "f1",
                    mealType = "lunch",
                    servings = 1.0,
                    date = "2024-01-15",
                )
            val created = TestFixtures.entry(id = "new-1")
            val reloaded = listOf(TestFixtures.entry(id = "1"), created)

            coEvery { api.createEntry(create) } returns created
            coEvery { api.getEntries("2024-01-15") } returns reloaded

            repository.refresh("2024-01-15")
            val result = repository.createEntry(create)

            assertEquals("new-1", result.id)
            coVerify { api.createEntry(create) }
        }
}
