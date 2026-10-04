package com.bissbilanz.android.sync

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.McpConnectionStore
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.sync.SyncManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class AccountDowngradeControllerTest {
    private lateinit var downgrader: AccountDowngrader
    private lateinit var syncManager: SyncManager
    private lateinit var mcpConnectionStore: McpConnectionStore
    private lateinit var controller: AccountDowngradeController

    @BeforeTest
    fun setup() {
        downgrader = mockk(relaxed = true)
        syncManager = mockk(relaxed = true)
        mcpConnectionStore = mockk(relaxed = true)
        controller =
            AccountDowngradeController(
                downgrader,
                syncManager,
                mockk<ErrorReporter>(relaxed = true),
                CoroutineScope(UnconfinedTestDispatcher()),
                mcpConnectionStore,
            )
    }

    @Test
    fun clearsTheCachedAssistantConnectionOnceTheAccountIsDeleted() =
        runTest {
            coEvery { downgrader.pendingOps() } returns 0L
            coEvery { downgrader.parkedOps() } returns 0L

            controller.start()

            coVerifyOrder {
                downgrader.finalize()
                mcpConnectionStore.clear()
            }
        }

    @Test
    fun keepsTheCachedAssistantConnectionWhenTheDowngradeIsRefused() =
        runTest {
            coEvery { downgrader.pendingOps() } returns 0L
            coEvery { downgrader.parkedOps() } returns 2L

            controller.start()

            coVerify(exactly = 0) { mcpConnectionStore.clear() }
        }

    @Test
    fun refusesWhenParkedChangesExistBeforeTouchingTheServerAccount() =
        runTest {
            coEvery { downgrader.pendingOps() } returns 0L
            coEvery { downgrader.parkedOps() } returns 2L

            controller.start()

            assertEquals(
                AccountDowngradeController.State.Failed(R.string.settings_downgrade_error_parked),
                controller.state.value,
            )
            coVerify(exactly = 0) { downgrader.downloadAll(any()) }
            coVerify(exactly = 0) { downgrader.finalize() }
        }

    @Test
    fun refusesWhenTheDrainParksAChange() =
        runTest {
            coEvery { downgrader.pendingOps() } returnsMany listOf(2L, 1L)
            coEvery { downgrader.parkedOps() } returnsMany listOf(0L, 1L)

            controller.start()

            assertEquals(
                AccountDowngradeController.State.Failed(R.string.settings_downgrade_error_parked),
                controller.state.value,
            )
            coVerify(exactly = 0) { downgrader.finalize() }
        }

    @Test
    fun proceedsWhenNothingIsPendingOrParked() =
        runTest {
            coEvery { downgrader.pendingOps() } returns 0L
            coEvery { downgrader.parkedOps() } returns 0L

            controller.start()

            assertEquals(AccountDowngradeController.State.Done, controller.state.value)
            coVerify(exactly = 1) { downgrader.finalize() }
        }
}
