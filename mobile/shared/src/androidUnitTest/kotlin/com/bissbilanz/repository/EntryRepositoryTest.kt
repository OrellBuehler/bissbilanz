package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class EntryRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var repository: EntryRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db = mockk {
            every { bissbilanzDatabaseQueries } returns queries
        }
        repository = EntryRepository(api, db)
    }

    @Test
    fun loadEntriesUpdatesStateFlowOnSuccess() = runTest {
        val entries = listOf(TestFixtures.entry(id = "1"), TestFixtures.entry(id = "2"))
        coEvery { api.getEntries("2024-01-15") } returns entries

        repository.loadEntries("2024-01-15")

        assertEquals(2, repository.entries.value.size)
        assertEquals("1", repository.entries.value[0].id)
        assertEquals("2", repository.entries.value[1].id)
    }

    @Test
    fun loadEntriesCachesDataOnSuccess() = runTest {
        val entries = listOf(TestFixtures.entry(id = "1"))
        coEvery { api.getEntries("2024-01-15") } returns entries

        repository.loadEntries("2024-01-15")

        coVerify { queries.transaction(any(), any()) }
    }

    @Test
    fun deleteEntryRemovesFromStateFlow() = runTest {
        val entries = listOf(TestFixtures.entry(id = "1"), TestFixtures.entry(id = "2"), TestFixtures.entry(id = "3"))
        coEvery { api.getEntries("2024-01-15") } returns entries
        coEvery { api.deleteEntry("2") } returns Unit

        repository.loadEntries("2024-01-15")
        assertEquals(3, repository.entries.value.size)

        repository.deleteEntry("2")

        assertEquals(2, repository.entries.value.size)
        assertTrue(repository.entries.value.none { it.id == "2" })
    }

    @Test
    fun deleteEntryCallsApiAndDatabase() = runTest {
        val entries = listOf(TestFixtures.entry(id = "1"))
        coEvery { api.getEntries("2024-01-15") } returns entries
        coEvery { api.deleteEntry("1") } returns Unit

        repository.loadEntries("2024-01-15")
        repository.deleteEntry("1")

        coVerify { api.deleteEntry("1") }
        coVerify { queries.deleteEntry("1") }
    }

    @Test
    fun createEntryCallsApiAndReloadsEntries() = runTest {
        val create = EntryCreate(
            foodId = "f1",
            mealType = "lunch",
            servings = 1.0,
            date = "2024-01-15",
        )
        val created = TestFixtures.entry(id = "new-1")
        val reloaded = listOf(TestFixtures.entry(id = "1"), created)

        coEvery { api.createEntry(create) } returns created
        coEvery { api.getEntries("2024-01-15") } returns reloaded

        repository.loadEntries("2024-01-15")
        val result = repository.createEntry(create)

        assertEquals("new-1", result.id)
        coVerify { api.createEntry(create) }
    }

    @Test
    fun entriesStateFlowStartsEmpty() {
        assertTrue(repository.entries.value.isEmpty())
    }
}
