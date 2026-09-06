package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.Entry
import com.bissbilanz.sync.QueuedRequest
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.EntryField
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
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

    /**
     * Emptying a field has to be spelled out: `EntryUpdate` encodes both "unchanged" and
     * "cleared" as null and the shared Json omits nulls, so before this the value stayed
     * put locally and on the server.
     */
    @Test
    fun clearingQuickMacrosNullsThemLocallyAndQueuesAnExplicitClear() =
        runTest {
            val quick =
                Entry(
                    id = "e1",
                    date = "2024-01-15",
                    mealType = "Lunch",
                    servings = 1.0,
                    quickName = "Kebab",
                    quickCalories = 700.0,
                    quickProtein = 30.0,
                    notes = "extra sauce",
                )
            coEvery { api.getEntries("2024-01-15") } returns listOf(quick)
            coEvery { syncQueue.all() } returns emptyList()
            repository.refresh("2024-01-15")

            repository.updateEntry(
                "e1",
                EntryUpdate(mealType = "Lunch", servings = 1.0),
                cleared = setOf(EntryField.QUICK_PROTEIN, EntryField.NOTES),
            )

            val after = repository.entriesByDateOnce("2024-01-15").first { it.id == "e1" }
            assertNull(after.quickProtein, "the cleared macro must be gone from the cache too")
            assertNull(after.notes)
            assertEquals(700.0, after.quickCalories)
            assertEquals("Kebab", after.quickName)
            coVerify {
                syncQueue.enqueue(
                    match<SyncOperation> {
                        it is SyncOperation.UpdateEntry && it.clearedKeys == listOf("notes", "quickProtein")
                    },
                )
            }
        }

    @Test
    fun clearingTheLastNutrientEmptiesTheMap() =
        runTest {
            val quick =
                Entry(
                    id = "e1",
                    date = "2024-01-15",
                    mealType = "Lunch",
                    servings = 1.0,
                    quickCalories = 100.0,
                    quickNutrients = mapOf("sodium" to 400.0),
                )
            coEvery { api.getEntries("2024-01-15") } returns listOf(quick)
            coEvery { syncQueue.all() } returns emptyList()
            repository.refresh("2024-01-15")

            // Removing one of two nutrients already worked (a shrunken map is sent);
            // removing the last one produced a null the wire dropped.
            repository.updateEntry(
                "e1",
                EntryUpdate(quickNutrients = null),
                cleared = setOf(EntryField.QUICK_NUTRIENTS),
            )

            val after = repository.entriesByDateOnce("2024-01-15").first { it.id == "e1" }
            assertNull(after.quickNutrients)
            coVerify {
                syncQueue.enqueue(
                    match<SyncOperation> {
                        it is SyncOperation.UpdateEntry && it.clearedKeys == listOf("quickNutrients")
                    },
                )
            }
        }

    @Test
    fun anUpdateWithoutClearsKeepsTheExistingValues() =
        runTest {
            val quick =
                Entry(
                    id = "e1",
                    date = "2024-01-15",
                    mealType = "Lunch",
                    servings = 1.0,
                    quickProtein = 30.0,
                    notes = "extra sauce",
                )
            coEvery { api.getEntries("2024-01-15") } returns listOf(quick)
            coEvery { syncQueue.all() } returns emptyList()
            repository.refresh("2024-01-15")

            repository.updateEntry("e1", EntryUpdate(servings = 2.0))

            val after = repository.entriesByDateOnce("2024-01-15").first { it.id == "e1" }
            assertEquals(30.0, after.quickProtein)
            assertEquals("extra sauce", after.notes)
        }

    @Test
    fun refreshDropsTempRowWhoseCreateAlreadyUploaded() =
        runTest {
            coEvery { syncQueue.all() } returns emptyList()
            val temp =
                repository.createEntry(
                    EntryCreate(foodId = "f1", mealType = "Lunch", servings = 1.0, date = "2024-01-15"),
                )
            // The create drained: no queued operation references the temp id any more and
            // the server list carries the same entry under its real id. Keeping the local
            // copy would show the entry twice.
            coEvery { api.getEntries("2024-01-15") } returns listOf(TestFixtures.entry(id = "srv-1"))

            repository.refresh("2024-01-15")

            assertEquals(listOf("srv-1"), repository.entriesByDateOnce("2024-01-15").map { it.id })
            assertTrue(repository.entriesByDateOnce("2024-01-15").none { it.id == temp.id })
        }
}
