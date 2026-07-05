package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.model.SleepFoodCorrelationEntry
import com.bissbilanz.repository.AnalyticsRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.StatsRepository
import com.bissbilanz.storage.KeyValueStore
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class InsightsViewModelTest {
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
    private lateinit var statsRepo: StatsRepository
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var sleepRepo: SleepRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var analyticsRepo: AnalyticsRepository
    private lateinit var appModeManager: AppModeManager
    private lateinit var sleepEntriesFlow: MutableStateFlow<List<SleepEntry>>

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        sleepEntriesFlow = MutableStateFlow(emptyList())
        statsRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        analyticsRepo = mockk(relaxed = true)
        appModeManager = AppModeManager(InMemoryKeyValueStore())
        goalsRepo =
            mockk(relaxed = true) {
                every { goals() } returns MutableStateFlow(null)
            }
        sleepRepo =
            mockk(relaxed = true) {
                every { entries() } returns sleepEntriesFlow
            }
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter, analyticsRepo, appModeManager, SavedStateHandle())

    @Test
    fun loadSleepDataCallsRefreshOnRepository() =
        runTest {
            val viewModel = createViewModel()

            viewModel.loadSleepData()

            coVerify(atLeast = 1) { sleepRepo.refresh(any(), any()) }
        }

    @Test
    fun loadSleepDataFetchesCorrelationData() =
        runTest {
            val correlations =
                listOf(
                    SleepFoodCorrelationEntry(
                        date = "2024-01-15",
                        eveningCalories = 400.0,
                        sleepDurationMinutes = 480,
                        sleepQuality = 7,
                    ),
                )
            coEvery { sleepRepo.getSleepFoodCorrelation(any(), any()) } returns correlations

            val viewModel = createViewModel()
            viewModel.loadSleepData()

            assertEquals(1, viewModel.sleepFoodCorrelation.value.size)
            assertEquals("2024-01-15", viewModel.sleepFoodCorrelation.value[0].date)
        }

    @Test
    fun loadSleepDataHandlesRefreshFailureGracefully() =
        runTest {
            coEvery { sleepRepo.refresh(any(), any()) } throws RuntimeException("Network error")

            val viewModel = createViewModel()
            viewModel.loadSleepData()

            // Should not crash — snackbar not set for sleep load failures
            assertNull(viewModel.snackbarMessage.value)
        }

    @Test
    fun loadSleepDataHandlesCorrelationFailureGracefully() =
        runTest {
            coEvery { sleepRepo.getSleepFoodCorrelation(any(), any()) } throws RuntimeException("Network error")

            val viewModel = createViewModel()
            viewModel.loadSleepData()

            assertEquals(emptyList(), viewModel.sleepFoodCorrelation.value)
        }

    @Test
    fun createSleepEntryShowsSuccessSnackbar() =
        runTest {
            val entry = SleepCreate(durationMinutes = 480, quality = 8.0, entryDate = "2024-01-20")
            coEvery { sleepRepo.createEntry(entry) } returns testSleepEntry("new")

            val viewModel = createViewModel()
            viewModel.createSleepEntry(entry)

            assertEquals(R.string.sleep_logged, viewModel.snackbarMessage.value)
        }

    @Test
    fun createSleepEntryShowsFailureSnackbarOnError() =
        runTest {
            val entry = SleepCreate(durationMinutes = 480, quality = 8.0, entryDate = "2024-01-20")
            coEvery { sleepRepo.createEntry(entry) } throws RuntimeException("Network error")

            val viewModel = createViewModel()
            viewModel.createSleepEntry(entry)

            assertEquals(R.string.sleep_log_failed, viewModel.snackbarMessage.value)
        }

    @Test
    fun deleteSleepEntryShowsSuccessSnackbar() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } returns Unit

            val viewModel = createViewModel()
            viewModel.deleteSleepEntry("entry-1")

            assertEquals(R.string.sleep_deleted, viewModel.snackbarMessage.value)
        }

    @Test
    fun deleteSleepEntryShowsFailureSnackbarOnError() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } throws RuntimeException("Network error")

            val viewModel = createViewModel()
            viewModel.deleteSleepEntry("entry-1")

            assertEquals(R.string.sleep_delete_failed, viewModel.snackbarMessage.value)
        }

    @Test
    fun sleepEntriesFlowDelegatesFromRepository() =
        runTest {
            val entry = testSleepEntry("1")
            sleepEntriesFlow.value = listOf(entry)

            val viewModel = createViewModel()

            assertEquals(1, viewModel.sleepEntries.first().size)
            assertEquals("1", viewModel.sleepEntries.first()[0].id)
        }

    @Test
    fun clearSnackbarResetsMessage() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } returns Unit

            val viewModel = createViewModel()
            viewModel.deleteSleepEntry("entry-1")
            assertEquals(R.string.sleep_deleted, viewModel.snackbarMessage.value)

            viewModel.clearSnackbar()

            assertNull(viewModel.snackbarMessage.value)
        }

    @Test
    fun selectTabTriggersNutritionLoad() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(1)

            coVerify(atLeast = 1) { analyticsRepo.getNutrientsExtended(any(), any()) }
        }

    @Test
    fun selectTabIsLazySecondCallSkipped() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(1)
            viewModel.selectTab(1)

            coVerify(exactly = 1) { analyticsRepo.getNutrientsExtended(any(), any()) }
        }

    @Test
    fun selectRangeResetsLoadedTabs() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(1)
            viewModel.selectRange(1)

            coVerify(exactly = 2) { analyticsRepo.getNutrientsExtended(any(), any()) }
        }

    @Test
    fun novaResultComputedAfterNutritionLoad() =
        runTest {
            val viewModel = createViewModel()

            viewModel.loadNutritionAnalytics()

            assertNotNull(viewModel.novaResult.value)
        }

    @Test
    fun selectTabWeightTriggersWeightLoad() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(2)

            coVerify(atLeast = 1) { analyticsRepo.getWeightFood(any(), any()) }
        }

    @Test
    fun selectTabSleepTriggersSleepLoad() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(3)

            coVerify(atLeast = 1) { analyticsRepo.getSleepFood(any(), any()) }
        }

    @Test
    fun selectTabWeightIsLazySecondCallSkipped() =
        runTest {
            val viewModel = createViewModel()

            viewModel.selectTab(2)
            viewModel.selectTab(2)

            coVerify(exactly = 1) { analyticsRepo.getWeightFood(any(), any()) }
        }

    @Test
    fun nutritionLoadErrorDoesNotCrash() =
        runTest {
            coEvery { analyticsRepo.getNutrientsExtended(any(), any()) } throws RuntimeException("fail")

            val viewModel = createViewModel()
            viewModel.loadNutritionAnalytics()

            assertEquals(false, viewModel.nutritionLoading.value)
        }

    @Test
    fun weightLoadErrorDoesNotCrash() =
        runTest {
            coEvery { analyticsRepo.getWeightFood(any(), any()) } throws RuntimeException("fail")

            val viewModel = createViewModel()
            viewModel.loadWeightAnalytics()

            assertEquals(false, viewModel.weightLoading.value)
        }

    @Test
    fun sleepAnalyticsLoadErrorDoesNotCrash() =
        runTest {
            coEvery { analyticsRepo.getSleepFood(any(), any()) } throws RuntimeException("fail")

            val viewModel = createViewModel()
            viewModel.loadSleepAnalytics()

            assertEquals(false, viewModel.sleepLoading.value)
        }

    @Test
    fun isLocalModeReflectsAppModeManager() =
        runTest {
            assertFalse(createViewModel().isLocalMode)

            appModeManager.setMode(AppMode.LOCAL)

            assertTrue(createViewModel().isLocalMode)
        }

    @Test
    fun localModeSkipsServerOnlyStatsButLoadsDailyStats() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            createViewModel()

            coVerify(exactly = 0) { statsRepo.getWeeklyStats() }
            coVerify(exactly = 0) { statsRepo.getMonthlyStats() }
            coVerify(exactly = 0) { statsRepo.getStreaks() }
            coVerify(exactly = 0) { statsRepo.getTopFoods(any(), any()) }
            coVerify(exactly = 0) { statsRepo.getMealBreakdown(any(), any()) }
            coVerify(atLeast = 1) { statsRepo.getDailyStats(any(), any()) }
            coVerify(atLeast = 1) { statsRepo.getCalendarStats(any()) }
        }

    // On-device analytics (issue #321): AnalyticsRepository now computes these
    // from the local SQLDelight cache via LocalAnalytics, so local/anonymous
    // users get them too — the per-tab loaders intentionally no longer skip in
    // local mode (see commit 0cdcf8f3, which dropped the early `if (isLocalMode)
    // return` guards).
    @Test
    fun localModeLoadsNutritionAnalytics() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            val viewModel = createViewModel()
            viewModel.selectTab(1)

            coVerify(atLeast = 1) { analyticsRepo.getNutrientsExtended(any(), any()) }
            assertEquals(false, viewModel.nutritionLoading.value)
        }

    @Test
    fun localModeLoadsWeightAnalytics() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            val viewModel = createViewModel()
            viewModel.selectTab(2)

            coVerify(atLeast = 1) { analyticsRepo.getWeightFood(any(), any()) }
            assertEquals(false, viewModel.weightLoading.value)
        }

    @Test
    fun localModeLoadsSleepAnalytics() =
        runTest {
            appModeManager.setMode(AppMode.LOCAL)

            val viewModel = createViewModel()
            viewModel.selectTab(3)

            coVerify(atLeast = 1) { analyticsRepo.getSleepFood(any(), any()) }
            assertEquals(false, viewModel.sleepLoading.value)
        }

    @Test
    fun syncedModeLoadsServerOnlyStats() =
        runTest {
            appModeManager.setMode(AppMode.SYNCED)

            createViewModel()

            coVerify(atLeast = 1) { statsRepo.getWeeklyStats() }
            coVerify(atLeast = 1) { statsRepo.getStreaks() }
            coVerify(atLeast = 1) { statsRepo.getTopFoods(any(), any()) }
            coVerify(atLeast = 1) { statsRepo.getMealBreakdown(any(), any()) }
        }

    companion object {
        fun testSleepEntry(id: String) =
            SleepEntry(
                id = id,
                userId = "user-1",
                entryDate = "2024-01-20",
                durationMinutes = 480,
                quality = 8.0,
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
