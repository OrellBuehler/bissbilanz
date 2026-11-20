package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertTrue

class ReminderRepositoryRefreshTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun aRefreshThatEmptiesTheListStillAnnouncesTheChange() =
        runTest {
            val api = mockk<BissbilanzApi>()
            coEvery { api.getReminders() } returns emptyList()
            val cacheDb = inMemoryCacheDatabase()
            val appMode = appModeManager()
            val repository =
                ReminderRepository(
                    api,
                    inMemoryUserDataDatabase(),
                    cacheDb,
                    SyncQueue(cacheDb, json, appMode),
                    json,
                    NoopErrorReporter(),
                    appMode,
                )
            var changes = 0
            repository.onRemindersChanged = { changes++ }

            repository.refresh()

            assertTrue(changes > 0, "the alarms of reminders deleted elsewhere have to be rescheduled away")
        }
}
