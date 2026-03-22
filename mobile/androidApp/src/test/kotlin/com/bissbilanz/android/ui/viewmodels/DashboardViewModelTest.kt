package com.bissbilanz.android.ui.viewmodels

import app.cash.turbine.test
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
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
    private lateinit var prefsRepo: PreferencesRepository
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter
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
        prefsRepo =
            mockk(relaxed = true) {
                every { preferences() } returns MutableStateFlow(null)
            }
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialDateIsToday() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun previousDayDecrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)
            val today = viewModel.selectedDate.value

            viewModel.previousDay()

            assertNotEquals(today, viewModel.selectedDate.value)
            assertEquals(today.toEpochDays() - 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun nextDayIncrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)
            viewModel.previousDay()
            val yesterday = viewModel.selectedDate.value

            viewModel.nextDay()

            assertEquals(yesterday.toEpochDays() + 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun goToTodayResetsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)
            viewModel.previousDay()
            viewModel.previousDay()

            viewModel.goToToday()

            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun initLoadsData() =
        runTest {
            DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

            coVerify { entryRepo.refresh(any()) }
            coVerify { goalsRepo.refresh() }
        }

    @Test
    fun loadDataSetsLoadingFalseAfterCompletion() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun loadDataHandlesErrorsGracefully() =
        runTest {
            coEvery { entryRepo.refresh(any()) } throws RuntimeException("Network error")

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun entriesFlowDelegatesFromRepository() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

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

            viewModel.entries.test {
                awaitItem() // initial empty list
                entriesFlow.value = listOf(entry)
                val items = awaitItem()
                assertEquals(1, items.size)
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun goalsFlowDelegatesFromRepository() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

            val goals =
                Goals(
                    calorieGoal = 2000.0,
                    proteinGoal = 150.0,
                    carbGoal = 250.0,
                    fatGoal = 65.0,
                    fiberGoal = 30.0,
                )

            viewModel.goals.test {
                awaitItem() // initial null
                goalsFlow.value = goals
                val received = awaitItem()
                assertEquals(goals, received)
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun entriesWithCapitalizedMealTypeGroupCorrectly() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter)

            val entry =
                Entry(
                    id = "1",
                    userId = "u1",
                    foodId = "f1",
                    date = "2024-01-15",
                    mealType = "Breakfast",
                    servings = 1.0,
                    food =
                        Food(
                            id = "f1",
                            userId = "u1",
                            name = "Test",
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

            viewModel.entries.test {
                awaitItem() // initial empty list
                entriesFlow.value = listOf(entry)
                val items = awaitItem()
                assertEquals(1, items.size)
                assertEquals("Breakfast", items[0].mealType)

                val groups = items.groupBy { it.mealType.lowercase() }
                assertEquals(true, groups.containsKey("breakfast"))
                assertEquals(1, groups["breakfast"]?.size)
                cancelAndIgnoreRemainingEvents()
            }
        }
}
