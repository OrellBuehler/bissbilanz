package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.QueuedRequest
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
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
import kotlin.test.assertTrue

class EntryRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: EntryRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = mockk(relaxed = true)
        repository = EntryRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())
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
            coVerify {
                syncQueue.enqueue(
                    match<SyncOperation> { it is SyncOperation.CreateEntry && it.localId == result.id },
                )
            }
        }

    @Test
    fun deleteTempEntryRemovesQueuedCreateInsteadOfEnqueuingDelete() =
        runTest {
            repository.deleteEntry("temp_abc")

            coVerify { syncQueue.removeByAffected("entries", "temp_abc") }
            coVerify(exactly = 0) { syncQueue.enqueue(any()) }
        }

    @Test
    fun deleteServerEntryEnqueuesDeleteOperation() =
        runTest {
            repository.deleteEntry("server-1")

            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.DeleteEntry && it.id == "server-1" }) }
        }

    @Test
    fun refreshDoesNotClobberEntryWithPendingLocalUpdate() =
        runTest {
            val server = TestFixtures.entry(id = "e1")
            coEvery { api.getEntries("2024-01-15") } returns listOf(server)
            coEvery { syncQueue.all() } returns emptyList()

            // Initial load: cache holds the server value (servings = 1.0) and currentDate is set.
            repository.refresh("2024-01-15")

            // User edits the entry: optimistic local write + a queued, not-yet-uploaded update.
            coEvery { syncQueue.all() } returns
                listOf(
                    QueuedRequest(
                        id = 1L,
                        operation = SyncOperation.UpdateEntry("e1", "{}"),
                        createdAt = 0L,
                        retryCount = 0L,
                        idempotencyKey = "k",
                        clientEditedAt = "t",
                        nextAttemptAt = 0L,
                    ),
                )
            repository.updateEntry("e1", EntryUpdate(servings = 3.0))

            // A forced refresh races the upload; the server still returns the pre-edit value.
            repository.refresh("2024-01-15")

            val after = repository.entriesByDateOnce("2024-01-15").first { it.id == "e1" }
            assertEquals(3.0, after.servings)
        }

    @Test
    fun updateEntryWritesOptimisticallyWhenViewingAnotherDay() =
        runTest {
            val entry = TestFixtures.entry(id = "e1", date = "2024-01-10")
            coEvery { api.getEntries("2024-01-10") } returns listOf(entry)
            coEvery { api.getEntries("2024-01-20") } returns emptyList()

            repository.refresh("2024-01-10") // caches e1, currentDate = 2024-01-10
            repository.refresh("2024-01-20") // currentDate now 2024-01-20 (post-sync refreshAll(today))

            // Edit e1 (which lives on 2024-01-10) while the shared currentDate points elsewhere.
            repository.updateEntry("e1", EntryUpdate(servings = 5.0))

            val after = repository.entriesByDateOnce("2024-01-10").first { it.id == "e1" }
            assertEquals(5.0, after.servings)
        }

    @Test
    fun refreshDoesNotResurrectLocallyDeletedEntry() =
        runTest {
            val entry = TestFixtures.entry(id = "e1")
            coEvery { api.getEntries("2024-01-15") } returns listOf(entry)
            coEvery { syncQueue.all() } returns emptyList()

            repository.refresh("2024-01-15")

            // User deletes e1: local row removed + a queued, not-yet-uploaded delete.
            coEvery { syncQueue.all() } returns
                listOf(
                    QueuedRequest(
                        id = 1L,
                        operation = SyncOperation.DeleteEntry("e1"),
                        createdAt = 0L,
                        retryCount = 0L,
                        idempotencyKey = "k",
                        clientEditedAt = "t",
                        nextAttemptAt = 0L,
                    ),
                )
            repository.deleteEntry("e1")

            // A forced refresh races the upload; the server still lists e1.
            repository.refresh("2024-01-15")

            assertTrue(repository.entriesByDateOnce("2024-01-15").none { it.id == "e1" })
        }
}
