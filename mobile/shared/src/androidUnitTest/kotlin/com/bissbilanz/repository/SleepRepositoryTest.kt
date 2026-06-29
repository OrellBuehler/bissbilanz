package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepFoodCorrelationEntry
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SleepRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: SleepRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = mockk(relaxed = true)
        repository = SleepRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())
    }

    @Test
    fun refreshUpdatesEntriesFlow() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries

            repository.refresh("2024-01-01", "2024-01-31")

            val result = repository.entries().first()
            assertEquals(2, result.size)
            assertEquals("1", result[0].id)
            assertEquals("2", result[1].id)
        }

    @Test
    fun refreshHandlesApiFailureWithoutCrashing() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } throws RuntimeException("Network error")

            repository.refresh("2024-01-01", "2024-01-31")

            assertEquals(emptyList(), repository.entries().first())
        }

    @Test
    fun refreshWithNullDatesCallsApi() =
        runTest {
            coEvery { api.getSleepEntries(null, null) } returns emptyList()

            repository.refresh()

            coVerify { api.getSleepEntries(null, null) }
        }

    @Test
    fun createEntryAddsToEntriesFlow() =
        runTest {
            val existing = sleepEntry("existing")
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(existing)
            repository.refresh()

            val create = SleepCreate(durationMinutes = 480, quality = 8.0, entryDate = "2024-01-20")

            repository.createEntry(create)

            val entries = repository.entries().first()
            assertEquals(2, entries.size)
        }

    @Test
    fun createEntryReturnsTempEntry() =
        runTest {
            val create = SleepCreate(durationMinutes = 480, quality = 9.0, entryDate = "2024-01-20")

            val result = repository.createEntry(create)

            assertTrue(result.id.startsWith("temp_"))
            assertEquals(9.0, result.quality)
            assertEquals(480, result.durationMinutes)
        }

    @Test
    fun createEntryEnqueuesSyncOperation() =
        runTest {
            val create = SleepCreate(durationMinutes = 480, quality = 8.0, entryDate = "2024-01-20")

            repository.createEntry(create)

            coVerify { syncQueue.enqueue(any()) }
        }

    @Test
    fun deleteEntryRemovesFromFlow() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"), sleepEntry("3"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries
            repository.refresh()

            repository.deleteEntry("2")

            val remaining = repository.entries().first()
            assertEquals(2, remaining.size)
            assertTrue(remaining.none { it.id == "2" })
        }

    @Test
    fun deleteEntryEnqueuesSyncOperation() =
        runTest {
            repository.deleteEntry("1")

            coVerify { syncQueue.enqueue(any()) }
        }

    @Test
    fun updateEntryReplacesInFlow() =
        runTest {
            val original = sleepEntry("1", quality = 5.0)
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(original)
            repository.refresh()

            val update = SleepUpdate(quality = 8.0)
            repository.updateEntry("1", update)

            val entries = repository.entries().first()
            assertEquals(1, entries.size)
            assertEquals(8.0, entries[0].quality)
        }

    @Test
    fun updateEntryReturnsUpdatedEntry() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(sleepEntry("1"))
            repository.refresh()

            val update = SleepUpdate(quality = 9.0)
            val result = repository.updateEntry("1", update)

            assertEquals(9.0, result.quality)
        }

    @Test
    fun updateEntryEnqueuesSyncOperation() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(sleepEntry("1"))
            repository.refresh()

            repository.updateEntry("1", SleepUpdate(quality = 9.0))

            coVerify { syncQueue.enqueue(any()) }
        }

    @Test
    fun updateEntryDoesNotAffectOtherEntries() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"), sleepEntry("3"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries
            repository.refresh()

            repository.updateEntry("2", SleepUpdate(quality = 10.0))

            val result = repository.entries().first()
            assertEquals(3, result.size)
            assertTrue(result.any { it.id == "1" })
            assertTrue(result.any { it.id == "2" })
            assertTrue(result.any { it.id == "3" })
        }

    @Test
    fun getSleepFoodCorrelationReturnsData() =
        runTest {
            val correlations =
                listOf(
                    SleepFoodCorrelationEntry(
                        date = "2024-01-15",
                        eveningCalories = 500.0,
                        sleepDurationMinutes = 450,
                        sleepQuality = 7,
                    ),
                )
            coEvery { api.getSleepFoodCorrelation("2024-01-01", "2024-01-31") } returns correlations

            val result = repository.getSleepFoodCorrelation("2024-01-01", "2024-01-31")

            assertEquals(1, result.size)
            assertEquals("2024-01-15", result[0].date)
        }

    @Test
    fun getSleepFoodCorrelationReturnsEmptyListOnFailure() =
        runTest {
            coEvery { api.getSleepFoodCorrelation(any(), any()) } throws RuntimeException("Network error")

            val result = repository.getSleepFoodCorrelation("2024-01-01", "2024-01-31")

            assertEquals(emptyList(), result)
        }

    companion object {
        fun sleepEntry(
            id: String,
            quality: Double = 7.0,
        ) = SleepEntry(
            id = id,
            userId = "user-1",
            entryDate = "2024-01-15",
            durationMinutes = 480,
            quality = quality,
            bedtime = null,
            wakeTime = null,
            wakeUps = null,
            sleepLatencyMinutes = null,
            deepSleepMinutes = null,
            lightSleepMinutes = null,
            remSleepMinutes = null,
            source = null,
            notes = null,
        )
    }
}
