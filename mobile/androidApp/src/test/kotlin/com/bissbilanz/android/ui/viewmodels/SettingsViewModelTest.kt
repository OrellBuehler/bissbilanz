package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.AccountDowngradeController
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.cache.LocalDataWiper
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.storage.KeyValueStore
import com.bissbilanz.sync.SyncManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
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
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
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
    private lateinit var authManager: AuthManager
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var prefsRepo: PreferencesRepository
    private lateinit var api: BissbilanzApi
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter
    private lateinit var appModeManager: AppModeManager
    private lateinit var localDataWiper: LocalDataWiper
    private lateinit var accountDowngrader: AccountDowngrader
    private lateinit var syncManager: SyncManager

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authManager = mockk(relaxed = true)
        api = mockk(relaxed = true)
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        appModeManager = AppModeManager(InMemoryKeyValueStore())
        localDataWiper = mockk(relaxed = true)
        accountDowngrader = mockk(relaxed = true)
        syncManager = mockk(relaxed = true)
        goalsRepo =
            mockk(relaxed = true) {
                every { goals() } returns MutableStateFlow(null)
            }
        prefsRepo =
            mockk(relaxed = true) {
                every { preferences() } returns MutableStateFlow(null)
            }
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        SettingsViewModel(
            authManager,
            goalsRepo,
            prefsRepo,
            api,
            refreshManager,
            errorReporter,
            appModeManager,
            localDataWiper,
            AccountDowngradeController(
                accountDowngrader = accountDowngrader,
                syncManager = syncManager,
                errorReporter = errorReporter,
                scope = CoroutineScope(testDispatcher),
            ),
        )

    @Test
    fun modeFlowExposesAppModeManagerMode() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            val viewModel = createViewModel()

            assertEquals(AppMode.LOCAL, viewModel.mode.value)
        }

    @Test
    fun loadDataFetchesMealTypesWhenSynced() =
        runTest {
            appModeManager.setMode(AppMode.SYNCED)

            createViewModel()

            coVerify(atLeast = 1) { api.getMealTypes() }
        }

    @Test
    fun loadDataSkipsMealTypesInLocalMode() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            createViewModel()

            coVerify(exactly = 0) { api.getMealTypes() }
        }

    @Test
    fun logoutClearsAuthAndMode() =
        runTest {
            appModeManager.setMode(AppMode.SYNCED)

            val viewModel = createViewModel()
            viewModel.logout()

            verify(exactly = 1) { authManager.logout() }
            assertNull(appModeManager.mode.value)
        }

    @Test
    fun logoutWipesLocalDataBeforeClearingAuth() =
        runTest {
            appModeManager.setMode(AppMode.SYNCED)

            val viewModel = createViewModel()
            viewModel.logout()

            // The wipe must complete before the auth state flips (and the UI leaves).
            coVerifyOrder {
                localDataWiper.wipeAll()
                authManager.logout()
            }
            assertNull(appModeManager.mode.value)
        }

    @Test
    fun logoutStillClearsAuthWhenTheWipeFails() =
        runTest {
            appModeManager.setMode(AppMode.SYNCED)
            coEvery { localDataWiper.wipeAll() } throws RuntimeException("disk error")

            val viewModel = createViewModel()
            viewModel.logout()

            verify(exactly = 1) { authManager.logout() }
            assertNull(appModeManager.mode.value)
        }
}
