package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.model.SleepFoodCorrelationEntry
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.StatsRepository
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
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class InsightsViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var statsRepo: StatsRepository
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var sleepRepo: SleepRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var sleepEntriesFlow: MutableStateFlow<List<SleepEntry>>

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        sleepEntriesFlow = MutableStateFlow(emptyList())
        statsRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
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

    @Test
    fun loadSleepDataCallsRefreshOnRepository() =
        runTest {
            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)

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

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.loadSleepData()

            assertEquals(1, viewModel.sleepFoodCorrelation.value.size)
            assertEquals("2024-01-15", viewModel.sleepFoodCorrelation.value[0].date)
        }

    @Test
    fun loadSleepDataHandlesRefreshFailureGracefully() =
        runTest {
            coEvery { sleepRepo.refresh(any(), any()) } throws RuntimeException("Network error")

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.loadSleepData()

            // Should not crash — snackbar not set for sleep load failures
            assertNull(viewModel.snackbarMessage.value)
        }

    @Test
    fun loadSleepDataHandlesCorrelationFailureGracefully() =
        runTest {
            coEvery { sleepRepo.getSleepFoodCorrelation(any(), any()) } throws RuntimeException("Network error")

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.loadSleepData()

            assertEquals(emptyList(), viewModel.sleepFoodCorrelation.value)
        }

    @Test
    fun createSleepEntryShowsSuccessSnackbar() =
        runTest {
            val entry = SleepCreate(durationMinutes = 480, quality = 8, entryDate = "2024-01-20")
            coEvery { sleepRepo.createEntry(entry) } returns testSleepEntry("new")

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.createSleepEntry(entry)

            assertEquals("Sleep logged", viewModel.snackbarMessage.value)
        }

    @Test
    fun createSleepEntryShowsFailureSnackbarOnError() =
        runTest {
            val entry = SleepCreate(durationMinutes = 480, quality = 8, entryDate = "2024-01-20")
            coEvery { sleepRepo.createEntry(entry) } throws RuntimeException("Network error")

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.createSleepEntry(entry)

            assertEquals("Failed to log sleep", viewModel.snackbarMessage.value)
        }

    @Test
    fun deleteSleepEntryShowsSuccessSnackbar() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } returns Unit

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.deleteSleepEntry("entry-1")

            assertEquals("Sleep entry deleted", viewModel.snackbarMessage.value)
        }

    @Test
    fun deleteSleepEntryShowsFailureSnackbarOnError() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } throws RuntimeException("Network error")

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.deleteSleepEntry("entry-1")

            assertEquals("Failed to delete", viewModel.snackbarMessage.value)
        }

    @Test
    fun sleepEntriesFlowDelegatesFromRepository() =
        runTest {
            val entry = testSleepEntry("1")
            sleepEntriesFlow.value = listOf(entry)

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)

            assertEquals(1, viewModel.sleepEntries.first().size)
            assertEquals("1", viewModel.sleepEntries.first()[0].id)
        }

    @Test
    fun clearSnackbarResetsMessage() =
        runTest {
            coEvery { sleepRepo.deleteEntry("entry-1") } returns Unit

            val viewModel = InsightsViewModel(statsRepo, goalsRepo, sleepRepo, errorReporter)
            viewModel.deleteSleepEntry("entry-1")
            assertEquals("Sleep entry deleted", viewModel.snackbarMessage.value)

            viewModel.clearSnackbar()

            assertNull(viewModel.snackbarMessage.value)
        }

    companion object {
        fun testSleepEntry(id: String) =
            SleepEntry(
                id = id,
                userId = "user-1",
                entryDate = "2024-01-20",
                durationMinutes = 480,
                quality = 8,
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
