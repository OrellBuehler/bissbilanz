package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SleepRepositoryRefreshTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var repository: SleepRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        val appMode = appModeManager(AppMode.SYNCED)
        repository = SleepRepository(api, db, cacheDb, SyncQueue(cacheDb, json, appMode), json, NoopErrorReporter(), appMode)
    }

    @Test
    fun refreshKeepsAQueuedCreateAndItsTempRow() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns emptyList()
            val temp = repository.createEntry(SleepCreate(durationMinutes = 420, quality = 7.0, entryDate = "2024-01-20"))

            repository.refresh("2024-01-01", "2024-01-31")

            assertEquals(listOf(temp.id), repository.entries().first().map { it.id })
        }

    @Test
    fun refreshKeepsAQueuedEditOverTheStaleServerCopy() =
        runTest {
            coEvery { api.getSleepEntries(any(), any()) } returns listOf(entry("a", "2024-01-10", quality = 5.0))
            repository.refresh()
            repository.updateEntry("a", SleepUpdate(quality = 9.0))

            repository.refresh()

            assertEquals(
                9.0,
                repository
                    .entries()
                    .first()
                    .single()
                    .quality,
            )
        }

    @Test
    fun rangedRefreshKeepsRowsOutsideTheRange() =
        runTest {
            coEvery { api.getSleepEntries(null, null) } returns
                listOf(
                    entry("old", "2024-01-01"),
                    entry("mid", "2024-02-10"),
                    entry("new", "2024-03-20"),
                )
            repository.refresh()

            coEvery { api.getSleepEntries("2024-02-01", "2024-02-28") } returns listOf(entry("mid2", "2024-02-11"))
            repository.refresh("2024-02-01", "2024-02-28")

            val ids =
                repository
                    .entries()
                    .first()
                    .map { it.id }
                    .toSet()
            assertEquals(setOf("old", "mid2", "new"), ids)
        }

    @Test
    fun unrangedRefreshDropsRowsTheServerNoLongerHas() =
        runTest {
            coEvery { api.getSleepEntries(null, null) } returns listOf(entry("a", "2024-01-10"), entry("b", "2024-01-11"))
            repository.refresh()

            coEvery { api.getSleepEntries(null, null) } returns listOf(entry("b", "2024-01-11"))
            repository.refresh()

            assertTrue(repository.entries().first().none { it.id == "a" })
        }

    private fun entry(
        id: String,
        date: String,
        quality: Double = 7.0,
    ): SleepEntry = SleepRepositoryTest.sleepEntry(id, quality).copy(entryDate = date)
}
