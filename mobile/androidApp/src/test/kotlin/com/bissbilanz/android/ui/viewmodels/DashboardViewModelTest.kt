package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.api.generated.model.DayProperties
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.time.Clock

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
                coEvery { cachedDayPropertiesOnce(any()) } returns null
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
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun previousDayDecrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val today = viewModel.selectedDate.value

            viewModel.previousDay()

            assertNotEquals(today, viewModel.selectedDate.value)
            assertEquals(today.toEpochDays() - 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun nextDayIncrementsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            viewModel.previousDay()
            val yesterday = viewModel.selectedDate.value

            viewModel.nextDay()

            assertEquals(yesterday.toEpochDays() + 1, viewModel.selectedDate.value.toEpochDays())
        }

    @Test
    fun nextDayDoesNotGoPastToday() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val today = viewModel.selectedDate.value

            viewModel.nextDay()

            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun goToTodayResetsDate() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            viewModel.previousDay()
            viewModel.previousDay()

            viewModel.goToToday()

            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun initLoadsData() =
        runTest {
            DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())

            coVerify { entryRepo.refresh(any()) }
            coVerify { goalsRepo.refresh() }
        }

    @Test
    fun loadDataSetsLoadingFalseAfterCompletion() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.entries.collect {} }

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun anEmptyDayKeepsTheSkeletonUntilTheRefreshAnswers() =
        runTest {
            val refreshed = CompletableDeferred<Unit>()
            coEvery { entryRepo.refresh(any()) } coAnswers { refreshed.await() }
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.entries.collect {} }

            assertEquals(true, viewModel.isLoading.value)
            refreshed.complete(Unit)
            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun cachedEntriesEndTheSkeletonBeforeTheRefreshAnswers() =
        runTest {
            coEvery { entryRepo.refresh(any()) } coAnswers { CompletableDeferred<Unit>().await() }
            entriesFlow.value = listOf(Entry(id = "1", userId = "u1", date = "2024-01-15", mealType = "lunch", servings = 1.0))
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.entries.collect {} }

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun loadDataHandlesErrorsGracefully() =
        runTest {
            coEvery { entryRepo.refresh(any()) } throws RuntimeException("Network error")

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.entries.collect {} }

            assertEquals(false, viewModel.isLoading.value)
        }

    @Test
    fun entriesFlowDelegatesFromRepository() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())

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
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())

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
    fun toggleFastingDayOnCallsSetDayProperties() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val date = viewModel.selectedDate.value.toString()
            assertEquals(false, viewModel.isFastingDay.value)

            viewModel.toggleFastingDay()

            assertEquals(true, viewModel.isFastingDay.value)
            coVerify { entryRepo.setDayProperties(date, isFastingDay = true) }
        }

    @Test
    fun toggleFastingDayOffCallsSetDayPropertiesFalseWithoutDeleting() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val date = viewModel.selectedDate.value.toString()
            viewModel.toggleFastingDay()
            assertEquals(true, viewModel.isFastingDay.value)

            viewModel.toggleFastingDay()

            assertEquals(false, viewModel.isFastingDay.value)
            coVerify { entryRepo.setDayProperties(date, isFastingDay = false) }
            coVerify(exactly = 0) { entryRepo.deleteDayProperties(any()) }
        }

    @Test
    fun toggleFastingDayRevertsOnError() =
        runTest {
            coEvery { entryRepo.setDayProperties(any(), any()) } throws RuntimeException("Network error")

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            viewModel.toggleFastingDay()

            assertEquals(false, viewModel.isFastingDay.value)
            assertEquals(UiMessage(R.string.dashboard_fasting_update_failed), viewModel.snackbarMessage.value)
        }

    @Test
    fun entriesRefreshFailureStillLoadsDayProperties() =
        runTest {
            coEvery { entryRepo.refresh(any()) } throws RuntimeException("offline")
            coEvery { entryRepo.getDayProperties(any()) } answers { dayProperties(firstArg(), waterMl = 1500) }

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())

            assertEquals(1500, viewModel.waterMl.value)
            assertEquals(true, viewModel.refreshFailed.value)
            viewModel.addWater(250)
            coVerify { entryRepo.setDayProperties(viewModel.selectedDate.value.toString(), waterMl = 1750) }
        }

    @Test
    fun switchingDaysAddsWaterOntoTheNewDaysCachedValue() =
        runTest {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val yesterday = today.minus(1, DateTimeUnit.DAY).toString()
            val yesterdayProps = CompletableDeferred<DayProperties?>()
            coEvery { entryRepo.getDayProperties(today.toString()) } returns dayProperties(today.toString(), waterMl = 1500)
            coEvery { entryRepo.cachedDayPropertiesOnce(yesterday) } returns dayProperties(yesterday, waterMl = 500)
            coEvery { entryRepo.getDayProperties(yesterday) } coAnswers { yesterdayProps.await() }
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            assertEquals(1500, viewModel.waterMl.value)

            // The cached value is on screen while the server is still being asked.
            viewModel.previousDay()
            assertEquals(500, viewModel.waterMl.value)
            viewModel.addWater(250)
            coVerify { entryRepo.setDayProperties(yesterday, waterMl = 750) }
            coVerify(exactly = 0) { entryRepo.setDayProperties(yesterday, waterMl = 1750) }

            // A slower server answer must not revert the edit.
            yesterdayProps.complete(dayProperties(yesterday, waterMl = 600))
            assertEquals(750, viewModel.waterMl.value)
        }

    @Test
    fun aDashboardLeftOnTodayMovesToTheNewToday() =
        runTest {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val yesterday = today.minus(1, DateTimeUnit.DAY).toString()
            val state = SavedStateHandle(mapOf("selectedDate" to yesterday, "todayAtLastCheck" to yesterday))

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, state)

            assertEquals(today, viewModel.selectedDate.value)
        }

    @Test
    fun aDeliberatelyPickedPastDayStaysSelectedAfterMidnight() =
        runTest {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
            val yesterday = today.minus(1, DateTimeUnit.DAY)
            val earlier = today.minus(3, DateTimeUnit.DAY)
            val state = SavedStateHandle(mapOf("selectedDate" to earlier.toString(), "todayAtLastCheck" to yesterday.toString()))

            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, state)

            assertEquals(earlier, viewModel.selectedDate.value)
        }

    @Test
    fun setNotesCallsSetDayProperties() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val date = viewModel.selectedDate.value.toString()

            viewModel.setNotes("Felt great today")

            assertEquals("Felt great today", viewModel.notes.value)
            coVerify { entryRepo.setDayProperties(date, notes = "Felt great today") }
        }

    @Test
    fun addWaterClampsToMaxWaterMl() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())
            val date = viewModel.selectedDate.value.toString()

            viewModel.addWater(MAX_WATER_ML + 500)

            assertEquals(MAX_WATER_ML, viewModel.waterMl.value)
            coVerify { entryRepo.setDayProperties(date, waterMl = MAX_WATER_ML) }
        }

    private fun dayProperties(
        date: String,
        waterMl: Int? = null,
    ) = DayProperties(
        date = date,
        isFastingDay = false,
        notes = null,
        waterMl = waterMl,
        activityCalories = null,
        activityNote = null,
        activityCaloriesSource = null,
    )

    @Test
    fun entriesWithCapitalizedMealTypeGroupCorrectly() =
        runTest {
            val viewModel = DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter, SavedStateHandle())

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
