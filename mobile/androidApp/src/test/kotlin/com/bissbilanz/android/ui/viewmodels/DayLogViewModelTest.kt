package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class DayLogViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entryRepo: EntryRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        entryRepo =
            mockk(relaxed = true) {
                every { entriesByDate(any()) } returns entriesFlow
            }
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadEntriesSetsLoadingAndCallsRepository() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } coAnswers {
                entriesFlow.value = listOf(testEntry("1"))
            }

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.visibleEntries.collect {} }
            viewModel.loadEntries("2024-01-15")

            coVerify { entryRepo.refresh("2024-01-15") }
            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun loadEntriesSetsErrorOnFailure() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } throws RuntimeException("Network error")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.visibleEntries.collect {} }
            viewModel.loadEntries("2024-01-15")

            assertEquals(R.string.daylog_load_failed, viewModel.error.value)
            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun anEmptyDayKeepsTheSkeletonUntilTheRefreshAnswers() =
        runTest {
            val refreshed = CompletableDeferred<Unit>()
            coEvery { entryRepo.refresh("2024-01-15") } coAnswers { refreshed.await() }
            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.visibleEntries.collect {} }
            viewModel.loadEntries("2024-01-15")

            assertEquals(true, viewModel.isLoading.value)
            refreshed.complete(Unit)
            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun copyEntriesReturnsCountFromRepository() =
        runTest {
            coEvery { entryRepo.copyEntries("2024-01-14", "2024-01-15") } returns 3

            val viewModel = DayLogViewModel(entryRepo, errorReporter)

            assertEquals(3, viewModel.copyEntries("2024-01-14", "2024-01-15"))
        }

    @Test
    fun copyEntriesReportsFailureAndReturnsNull() =
        runTest {
            val failure = RuntimeException("Network error")
            coEvery { entryRepo.copyEntries(any(), any()) } throws failure

            val viewModel = DayLogViewModel(entryRepo, errorReporter)

            assertNull(viewModel.copyEntries("2024-01-14", "2024-01-15"))
            io.mockk.verify { errorReporter.captureException(failure) }
        }

    @Test
    fun loadEntriesSkipsDuplicateDate() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } coAnswers {
                entriesFlow.value = listOf(testEntry("1"))
            }

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.loadEntries("2024-01-15")
            viewModel.loadEntries("2024-01-15")

            coVerify(exactly = 1) { entryRepo.refresh("2024-01-15") }
        }

    @Test
    fun deleteEntryCallsRepository() =
        runTest {
            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.deleteEntry("entry-1")

            coVerify { entryRepo.deleteEntry("entry-1") }
        }

    @Test
    fun deleteEntrySetsErrorOnFailure() =
        runTest {
            coEvery { entryRepo.deleteEntry("entry-1") } throws RuntimeException("Delete failed")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.deleteEntry("entry-1")

            assertEquals(R.string.daylog_delete_failed, viewModel.error.value)
        }

    @Test
    fun scheduledDeleteHidesTheEntryUntilTheSnackbarIsDismissed() =
        runTest {
            val viewModel = DayLogViewModel(entryRepo, errorReporter)

            viewModel.scheduleDelete(testEntry("entry-1"))
            assertEquals(setOf("entry-1"), viewModel.pendingDeleteIds.value)
            coVerify(exactly = 0) { entryRepo.deleteEntry(any()) }

            viewModel.commitDelete("entry-1")
            coVerify(exactly = 1) { entryRepo.deleteEntry("entry-1") }
            assertEquals(emptySet(), viewModel.pendingDeleteIds.value)
        }

    @Test
    fun undoKeepsTheEntry() =
        runTest {
            val viewModel = DayLogViewModel(entryRepo, errorReporter)

            viewModel.scheduleDelete(testEntry("entry-1"))
            viewModel.undoDelete("entry-1")
            viewModel.commitDelete("entry-1")

            assertEquals(emptySet(), viewModel.pendingDeleteIds.value)
            coVerify(exactly = 0) { entryRepo.deleteEntry(any()) }
        }

    @Test
    fun scheduledDeleteCommitsOnItsOwnWhenNoSnackbarReportsBack() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = DayLogViewModel(entryRepo, errorReporter)

            viewModel.scheduleDelete(testEntry("entry-1"))
            advanceTimeBy(DayLogViewModel.UNDO_FALLBACK_MS + 1)
            advanceUntilIdle()

            coVerify(exactly = 1) { entryRepo.deleteEntry("entry-1") }
        }

    @Test
    fun undoAfterTheFallbackDeleteLogsTheEntryAgain() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            val entry = testEntry("entry-1")

            viewModel.scheduleDelete(entry)
            advanceTimeBy(DayLogViewModel.UNDO_FALLBACK_MS + 1)
            advanceUntilIdle()
            viewModel.undoDelete("entry-1")
            advanceUntilIdle()

            coVerify(exactly = 1) { entryRepo.deleteEntry("entry-1") }
            coVerify(exactly = 1) { entryRepo.restoreEntry(entry) }
        }

    @Test
    fun clearErrorResetsErrorState() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } throws RuntimeException("Error")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.loadEntries("2024-01-15")
            assertEquals(R.string.daylog_load_failed, viewModel.error.value)

            viewModel.clearError()
            assertNull(viewModel.error.value)
        }

    companion object {
        fun testEntry(id: String) =
            Entry(
                id = id,
                userId = "user-1",
                foodId = "food-1",
                date = "2024-01-15",
                mealType = "lunch",
                servings = 1.0,
                food =
                    Food(
                        id = "food-1",
                        userId = "user-1",
                        name = "Test Food",
                        brand = null,
                        servingSize = 100.0,
                        servingUnit = Food.ServingUnit.g,
                        calories = 200.0,
                        protein = 20.0,
                        carbs = 25.0,
                        fat = 8.0,
                        fiber = 3.0,
                        barcode = null,
                        nutriScore = null,
                        novaGroup = null,
                        additives = null,
                        ingredientsText = null,
                        imageUrl = null,
                    ),
            )
    }
}
