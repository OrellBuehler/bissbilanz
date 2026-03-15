package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.model.Entry
import com.bissbilanz.model.Food
import com.bissbilanz.model.Goals
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
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
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entryRepo: EntryRepository
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>
    private lateinit var goalsFlow: MutableStateFlow<Goals?>

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        goalsFlow = MutableStateFlow(null)
        entryRepo =
            mockk(relaxed = true) {
                every { entriesByDate(any()) } returns entriesFlow
            }
        goalsRepo =
            mockk(relaxed = true) {
                every { goals() } returns goalsFlow
            }
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialDateIsToday() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun previousDayDecrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)
            val today = viewModel.selectedDate.value

            viewModel.previousDay()

            assertNotEquals(today, viewModel.selectedDate.value)
            assertEquals(today.toEpochDays() - 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun nextDayIncrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)
            viewModel.previousDay()
            val yesterday = viewModel.selectedDate.value

            viewModel.nextDay()

            assertEquals(yesterday.toEpochDays() + 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun goToTodayResetsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)
            viewModel.previousDay()
            viewModel.previousDay()

            viewModel.goToToday()

            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun initLoadsData() =
        runTest {
            DashboardViewModel(entryRepo, goalsRepo)

            coVerify { entryRepo.refresh(any()) }
            coVerify { goalsRepo.refresh() }
        }

    @Test
    fun loadDataSetsLoadingFalseAfterCompletion() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun loadDataHandlesErrorsGracefully() =
        runTest {
            coEvery { entryRepo.refresh(any()) } throws RuntimeException("Network error")

            val viewModel = DashboardViewModel(entryRepo, goalsRepo)

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun entriesFlowDelegatesFromRepository() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)

            val entry =
                Entry(
                    id = "1",
                    userId = "u1",
                    foodId = "f1",
                    date = "2024-01-15",
                    mealType = "lunch",
                    servings = 1.0,
                    food =
                        Food(
                            id = "f1",
                            userId = "u1",
                            name = "Test",
                            servingSize = 100.0,
                            servingUnit = ServingUnit.G,
                            calories = 200.0,
                            protein = 20.0,
                            carbs = 25.0,
                            fat = 8.0,
                            fiber = 3.0,
                        ),
                )
            entriesFlow.value = listOf(entry)

            assertEquals(1, viewModel.entries.value.size)
        }

    @Test
    fun goalsFlowDelegatesFromRepository() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo)

            val goals =
                Goals(
                    calorieGoal = 2000.0,
                    proteinGoal = 150.0,
                    carbGoal = 250.0,
                    fatGoal = 65.0,
                    fiberGoal = 30.0,
                )
            goalsFlow.value = goals

            assertEquals(goals, viewModel.goals.value)
        }
}
