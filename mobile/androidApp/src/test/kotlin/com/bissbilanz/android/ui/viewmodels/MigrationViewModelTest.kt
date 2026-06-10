package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.migration.LocalDataMigrator
import com.bissbilanz.migration.MigrationPlan
import com.bissbilanz.migration.MigrationState
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.storage.KeyValueStore
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

@OptIn(ExperimentalCoroutinesApi::class)
class MigrationViewModelTest {
    private class InMemoryKeyValueStore : KeyValueStore {
        private val values = mutableMapOf<String, String>()

        override fun save(
            key: String,
            value: String,
        ) {
            values[key] = value
        }

        override fun load(key: String): String? = values[key]

        override fun delete(key: String) {
            values.remove(key)
        }
    }

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var migrator: LocalDataMigrator
    private lateinit var migratorState: MutableStateFlow<MigrationState>
    private lateinit var appModeManager: AppModeManager
    private lateinit var authManager: AuthManager
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        migratorState = MutableStateFlow(MigrationState.Idle)
        migrator =
            mockk(relaxed = true) {
                every { state } returns migratorState
            }
        appModeManager = AppModeManager(InMemoryKeyValueStore()).apply { setMode(AppMode.LOCAL) }
        authManager = mockk(relaxed = true)
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun plan(total: Int) =
        MigrationPlan(
            foods = total,
            recipes = 0,
            entries = 0,
            weights = 0,
            sleepEntries = 0,
            supplements = 0,
            supplementLogs = 0,
            dayProperties = 0,
            hasGoals = false,
            hasPreferences = false,
        )

    private fun createViewModel() = MigrationViewModel(migrator, appModeManager, authManager, refreshManager, errorReporter)

    @Test
    fun noLocalDataFlipsModeDirectlyWithoutMigrating() =
        runTest {
            every { migrator.plan() } returns plan(total = 0)

            createViewModel()

            assertEquals(AppMode.SYNCED, appModeManager.mode.value)
            coVerify(exactly = 0) { migrator.serverHasData() }
            coVerify(exactly = 0) { migrator.migrate() }
        }

    @Test
    fun emptyAccountAutoStartsTheUpload() =
        runTest {
            every { migrator.plan() } returns plan(total = 5)
            coEvery { migrator.serverHasData() } returns false

            createViewModel()

            coVerify(exactly = 1) { migrator.migrate() }
            assertEquals(AppMode.LOCAL, appModeManager.mode.value)
        }

    @Test
    fun accountWithDataShowsChoiceInsteadOfUploading() =
        runTest {
            every { migrator.plan() } returns plan(total = 7)
            coEvery { migrator.serverHasData() } returns true

            val viewModel = createViewModel()

            val state = viewModel.uiState.value
            assertIs<MigrationUiState.Choice>(state)
            assertEquals(7, state.localItemCount)
            coVerify(exactly = 0) { migrator.migrate() }
        }

    @Test
    fun startUploadFromChoiceMigratesAndRefreshesOnCompletion() =
        runTest {
            every { migrator.plan() } returns plan(total = 7)
            coEvery { migrator.serverHasData() } returns true
            coEvery { migrator.migrate() } answers { migratorState.value = MigrationState.Completed }

            val viewModel = createViewModel()
            viewModel.startUpload()

            coVerify(exactly = 1) { migrator.migrate() }
            coVerify(exactly = 1) { refreshManager.refreshAll() }
        }

    @Test
    fun migrationProgressIsExposedAsInProgressState() =
        runTest {
            every { migrator.plan() } returns plan(total = 5)
            coEvery { migrator.serverHasData() } returns false
            coEvery { migrator.migrate() } answers {
                migratorState.value = MigrationState.Running(done = 2, total = 5, step = LocalDataMigrator.STEP_ENTRIES)
            }

            val viewModel = createViewModel()

            val state = viewModel.uiState.value
            assertIs<MigrationUiState.InProgress>(state)
            assertEquals(2, state.done)
            assertEquals(5, state.total)
            assertEquals(LocalDataMigrator.STEP_ENTRIES, state.step)
        }

    @Test
    fun failedMigrationShowsFailureAndRetryMigratesAgain() =
        runTest {
            every { migrator.plan() } returns plan(total = 5)
            coEvery { migrator.serverHasData() } returns false
            coEvery { migrator.migrate() } answers { migratorState.value = MigrationState.Failed("network down") }

            val viewModel = createViewModel()

            val state = viewModel.uiState.value
            assertIs<MigrationUiState.Failed>(state)
            assertEquals("network down", state.message)
            assertEquals(AppMode.LOCAL, appModeManager.mode.value)

            viewModel.retry()

            coVerify(exactly = 2) { migrator.migrate() }
        }

    @Test
    fun preflightFailureShowsFailureAndRetryReruns() =
        runTest {
            every { migrator.plan() } returns plan(total = 5)
            coEvery { migrator.serverHasData() } throws RuntimeException("offline") andThen false

            val viewModel = createViewModel()

            val state = viewModel.uiState.value
            assertIs<MigrationUiState.Failed>(state)
            assertEquals("offline", state.message)
            coVerify(exactly = 0) { migrator.migrate() }

            viewModel.retry()

            coVerify(exactly = 1) { migrator.migrate() }
        }

    @Test
    fun startFreshDiscardsLocalData() =
        runTest {
            every { migrator.plan() } returns plan(total = 7)
            coEvery { migrator.serverHasData() } returns true

            val viewModel = createViewModel()
            viewModel.startFresh()

            coVerify(exactly = 1) { migrator.discardLocalData() }
            coVerify(exactly = 0) { migrator.migrate() }
        }

    @Test
    fun cancelToLocalLogsOutAndKeepsLocalMode() =
        runTest {
            every { migrator.plan() } returns plan(total = 5)
            coEvery { migrator.serverHasData() } returns false
            coEvery { migrator.migrate() } answers { migratorState.value = MigrationState.Failed("network down") }

            val viewModel = createViewModel()
            viewModel.cancelToLocal()

            verify(exactly = 1) { authManager.logout() }
            assertEquals(AppMode.LOCAL, appModeManager.mode.value)
        }
}
