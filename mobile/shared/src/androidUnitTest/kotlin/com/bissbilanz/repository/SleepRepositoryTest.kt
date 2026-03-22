package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.model.SleepFoodCorrelationEntry
import com.bissbilanz.model.SleepUpdate
import com.bissbilanz.test.NoopErrorReporter
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SleepRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var repository: SleepRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        repository = SleepRepository(api, NoopErrorReporter())
    }

    @Test
    fun refreshUpdatesEntriesFlow() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries

            repository.refresh("2024-01-01", "2024-01-31")

            assertEquals(2, repository.entries.first().size)
            assertEquals("1", repository.entries.first()[0].id)
            assertEquals("2", repository.entries.first()[1].id)
        }

    @Test
    fun refreshHandlesApiFailureWithoutCrashing() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } throws RuntimeException("Network error")

            repository.refresh("2024-01-01", "2024-01-31")

            assertEquals(emptyList(), repository.entries.first())
        }

    @Test
    fun refreshWithNullDatesCallsApi() =
        runTest {
            coEvery { api.getSleepEntries(null, null) } returns emptyList()

            repository.refresh()

            coVerify { api.getSleepEntries(null, null) }
        }

    @Test
    fun createEntryAddsToFrontOfFlow() =
        runTest {
            val existing = sleepEntry("existing")
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(existing)
            repository.refresh()

            val created = sleepEntry("new")
            val create = SleepCreate(durationMinutes = 480, quality = 8, entryDate = "2024-01-20")
            coEvery { api.createSleepEntry(create) } returns created

            repository.createEntry(create)

            val entries = repository.entries.first()
            assertEquals(2, entries.size)
            assertEquals("new", entries[0].id)
            assertEquals("existing", entries[1].id)
        }

    @Test
    fun createEntryReturnsCreatedEntry() =
        runTest {
            val created = sleepEntry("new", quality = 9.0)
            val create = SleepCreate(durationMinutes = 480, quality = 9, entryDate = "2024-01-20")
            coEvery { api.createSleepEntry(create) } returns created

            val result = repository.createEntry(create)

            assertEquals("new", result.id)
            assertEquals(9.0, result.quality)
        }

    @Test
    fun deleteEntryRemovesFromFlow() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"), sleepEntry("3"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries
            coEvery { api.deleteSleepEntry("2") } returns Unit
            repository.refresh()

            repository.deleteEntry("2")

            val remaining = repository.entries.first()
            assertEquals(2, remaining.size)
            assertTrue(remaining.none { it.id == "2" })
        }

    @Test
    fun deleteEntryCallsApi() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(sleepEntry("1"))
            coEvery { api.deleteSleepEntry("1") } returns Unit
            repository.refresh()

            repository.deleteEntry("1")

            coVerify { api.deleteSleepEntry("1") }
        }

    @Test
    fun updateEntryReplacesInFlow() =
        runTest {
            val original = sleepEntry("1", quality = 5.0)
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(original)
            repository.refresh()

            val updated = sleepEntry("1", quality = 8.0)
            val update = SleepUpdate(quality = 8)
            coEvery { api.updateSleepEntry("1", update) } returns updated

            repository.updateEntry("1", update)

            val entries = repository.entries.first()
            assertEquals(1, entries.size)
            assertEquals(8.0, entries[0].quality)
        }

    @Test
    fun updateEntryReturnsUpdatedEntry() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(sleepEntry("1"))
            repository.refresh()

            val updated = sleepEntry("1", quality = 9.0)
            val update = SleepUpdate(quality = 9)
            coEvery { api.updateSleepEntry("1", update) } returns updated

            val result = repository.updateEntry("1", update)

            assertEquals(9.0, result.quality)
        }

    @Test
    fun updateEntryDoesNotAffectOtherEntries() =
        runTest {
            val entries = listOf(sleepEntry("1"), sleepEntry("2"), sleepEntry("3"))
            coEvery { api.getSleepEntries(any(), any()) } returns entries
            repository.refresh()

            val updated = sleepEntry("2", quality = 10.0)
            val update = SleepUpdate(quality = 10)
            coEvery { api.updateSleepEntry("2", update) } returns updated

            repository.updateEntry("2", update)

            val result = repository.entries.first()
            assertEquals(3, result.size)
            assertEquals("1", result[0].id)
            assertEquals("2", result[1].id)
            assertEquals("3", result[2].id)
        }

    @Test
    fun getSleepFoodCorrelationReturnsData() =
        runTest {
            val correlations =
                listOf(
                    SleepFoodCorrelationEntry(
                        date = "2024-01-15",
                        eveningCalories = 500.0,
                        sleepDurationMinutes = 450.0,
                        sleepQuality = 7.0,
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
            durationMinutes = 480.0,
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
