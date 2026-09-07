package com.bissbilanz.android.fasting

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.sync.QueuedRequest
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import com.bissbilanz.api.generated.model.FastingSession as ServerFastingSession

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = FastingManagerTest.TestApp::class)
class FastingManagerTest {
    class TestApp : Application()

    private val json = Json { ignoreUnknownKeys = true }
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun manager(
        api: BissbilanzApi,
        appModeManager: AppModeManager,
        syncQueue: SyncQueue = mockk<SyncQueue>(relaxed = true).also { coEvery { it.all() } returns emptyList() },
    ): FastingManager {
        // A fresh prefs slate per test: FastingSessionStore is SharedPreferences-backed
        // and Robolectric's app context persists across tests in the same class.
        context
            .getSharedPreferences("fasting", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        return FastingManager(
            context,
            FastingSessionStore(context, json),
            mockk<EntryRepository>(relaxed = true),
            mockk<ErrorReporter>(relaxed = true),
            syncQueue,
            json,
            api,
            appModeManager,
        )
    }

    private fun serverSession(
        id: String,
        targetHours: Int = 8,
    ) = ServerFastingSession(
        id = id,
        userId = "user-1",
        startedAt = "2024-01-15T08:00:00Z",
        endedAt = "2024-01-15T16:00:00Z",
        targetHours = targetHours,
    )

    @Test
    fun refreshMergesServerFastsIntoHistory() =
        runTest {
            val api = mockk<BissbilanzApi>()
            coEvery { api.getFastingSessions(limit = any(), from = any(), to = any()) } returns
                listOf(serverSession("server-1"))
            val appModeManager = mockk<AppModeManager> { every { isLocal } returns false }
            val fastingManager = manager(api, appModeManager)

            fastingManager.refresh()

            val history = fastingManager.history.value
            assertEquals(1, history.size)
            assertEquals("server-1", history.first().id)
            assertEquals(8, history.first().targetHours)
        }

    @Test
    fun refreshInLocalModeSkipsServerPull() =
        runTest {
            val api = mockk<BissbilanzApi>()
            val appModeManager = mockk<AppModeManager> { every { isLocal } returns true }
            val fastingManager = manager(api, appModeManager)

            fastingManager.refresh()

            assertTrue(fastingManager.history.value.isEmpty())
            coVerify(exactly = 0) { api.getFastingSessions(any(), any(), any()) }
        }

    @Test
    fun refreshSkipsFastWithAnUnuploadedSyncOperation() =
        runTest {
            val api = mockk<BissbilanzApi>()
            coEvery { api.getFastingSessions(limit = any(), from = any(), to = any()) } returns
                listOf(serverSession("pending-1"))
            val appModeManager = mockk<AppModeManager> { every { isLocal } returns false }
            val queued =
                QueuedRequest(
                    id = 1,
                    operation = SyncOperation.UpsertFast("pending-1", "{}"),
                    createdAt = 0,
                    retryCount = 0,
                    idempotencyKey = "key",
                    clientEditedAt = "2024-01-15T00:00:00Z",
                    nextAttemptAt = 0,
                )
            val syncQueue = mockk<SyncQueue>(relaxed = true)
            coEvery { syncQueue.all() } returns listOf(queued)
            val fastingManager = manager(api, appModeManager, syncQueue)

            fastingManager.refresh()

            // The pending local fast is not clobbered by the (potentially stale) server copy.
            assertTrue(fastingManager.history.value.isEmpty())
        }

    @Test
    fun refreshNeverOverwritesTheRunningFast() =
        runTest {
            val api = mockk<BissbilanzApi>()
            val appModeManager = mockk<AppModeManager> { every { isLocal } returns false }
            val syncQueue = mockk<SyncQueue>(relaxed = true)
            coEvery { syncQueue.all() } returns emptyList()
            val fastingManager = manager(api, appModeManager, syncQueue)
            fastingManager.start(targetHours = 16)
            val runningId = checkNotNull(fastingManager.session.value).id
            coEvery { api.getFastingSessions(limit = any(), from = any(), to = any()) } returns
                listOf(serverSession(runningId))

            fastingManager.refresh()

            assertEquals(runningId, fastingManager.session.value?.id)
            assertTrue(fastingManager.history.value.none { it.id == runningId })
        }
}
