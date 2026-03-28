package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
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
            viewModel.loadEntries("2024-01-15")

            coVerify { entryRepo.refresh("2024-01-15") }
            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun loadEntriesSetsErrorOnFailure() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } throws RuntimeException("Network error")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.loadEntries("2024-01-15")

            assertEquals("Failed to load entries", viewModel.error.value)
            assertEquals(false, viewModel.isLoading.value)
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

            assertEquals("Failed to delete entry", viewModel.error.value)
        }

    @Test
    fun clearErrorResetsErrorState() =
        runTest {
            coEvery { entryRepo.refresh("2024-01-15") } throws RuntimeException("Error")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.loadEntries("2024-01-15")
            assertEquals("Failed to load entries", viewModel.error.value)

            viewModel.clearError()
            assertNull(viewModel.error.value)
        }

    @Test
    fun toggleFastingDayOnCallsSetDayProperties() =
        runTest {
            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            assertEquals(false, viewModel.isFastingDay.value)

            viewModel.toggleFastingDay("2024-01-15")

            assertEquals(true, viewModel.isFastingDay.value)
            coVerify { entryRepo.setDayProperties("2024-01-15", isFastingDay = true) }
        }

    @Test
    fun toggleFastingDayOffCallsDeleteDayProperties() =
        runTest {
            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            // Toggle on first
            viewModel.toggleFastingDay("2024-01-15")
            assertEquals(true, viewModel.isFastingDay.value)

            // Toggle off
            viewModel.toggleFastingDay("2024-01-15")

            assertEquals(false, viewModel.isFastingDay.value)
            coVerify { entryRepo.deleteDayProperties("2024-01-15") }
        }

    @Test
    fun toggleFastingDayRevertsOnError() =
        runTest {
            coEvery { entryRepo.setDayProperties(any(), any()) } throws RuntimeException("Network error")

            val viewModel = DayLogViewModel(entryRepo, errorReporter)
            viewModel.toggleFastingDay("2024-01-15")

            // Should revert to false after failure
            assertEquals(false, viewModel.isFastingDay.value)
            assertEquals("Failed to update fasting day", viewModel.error.value)
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
