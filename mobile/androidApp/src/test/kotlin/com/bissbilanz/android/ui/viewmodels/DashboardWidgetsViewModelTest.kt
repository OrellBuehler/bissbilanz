package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.StatsRepository
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.repository.WeightRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardWidgetsViewModelTest {
    private lateinit var supplementRepo: SupplementRepository
    private lateinit var statsRepo: StatsRepository
    private lateinit var errorReporter: ErrorReporter

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        supplementRepo =
            mockk(relaxed = true) {
                every { supplements() } returns MutableStateFlow(emptyList())
            }
        statsRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() =
        DashboardWidgetsViewModel(
            foodRepo = mockk<FoodRepository>(relaxed = true) { every { favorites() } returns emptyFlow() },
            recipeRepo = mockk<RecipeRepository>(relaxed = true) { every { allRecipes() } returns emptyFlow() },
            goalsRepo = mockk<GoalsRepository>(relaxed = true) { every { goals() } returns emptyFlow() },
            prefsRepo = mockk<PreferencesRepository>(relaxed = true) { every { preferences() } returns emptyFlow() },
            weightRepo = mockk<WeightRepository>(relaxed = true) { every { entries() } returns emptyFlow() },
            sleepRepo = mockk<SleepRepository>(relaxed = true) { every { entries() } returns emptyFlow() },
            supplementRepo = supplementRepo,
            statsRepo = statsRepo,
            errorReporter = errorReporter,
        )

    private fun log(
        supplementId: String,
        date: String,
    ) = SupplementLog(supplementId = supplementId, date = date, takenAt = "", entryIds = emptyList())

    @Test
    fun dataStartsUnloadedSoTheCardsCanTellItApartFromEmpty() {
        val viewModel = viewModel()

        assertNull(viewModel.calorieSeries.value)
        assertNull(viewModel.topFoods.value)
        assertEquals(emptyMap(), viewModel.takenByDate.value)
    }

    @Test
    fun aFailedCalorieFetchEndsLoadingWithAnEmptySeries() =
        runTest {
            coEvery { statsRepo.getDailyStats(any(), any()) } throws RuntimeException("offline")
            val viewModel = viewModel()

            viewModel.loadCalorieSeries("2026-09-06")

            assertEquals(emptyList(), viewModel.calorieSeries.value)
            coVerify { errorReporter.captureException(any()) }
        }

    @Test
    fun aFailedTopFoodsFetchEndsLoadingWithAnEmptyList() =
        runTest {
            val viewModel = viewModel()
            coEvery { statsRepo.getTopFoods(any(), any()) } throws RuntimeException("offline")

            viewModel.loadTopFoods()
            assertEquals(emptyList(), viewModel.topFoods.value)
        }

    @Test
    fun theNewDaysChecklistComesFromTheCacheBeforeTheServerAnswers() =
        runTest {
            val server = CompletableDeferred<List<SupplementLog>>()
            every { supplementRepo.cachedChecklist("2026-09-06") } returns listOf(log("a", "2026-09-06"))
            coEvery { supplementRepo.getChecklist("2026-09-06") } coAnswers { server.await() }
            val viewModel = viewModel()
            val loading = backgroundScope.launch { viewModel.loadChecklist("2026-09-06") }
            runCurrent()

            assertEquals(setOf("a"), viewModel.takenByDate.value["2026-09-06"])
            assertNull(viewModel.takenByDate.value["2026-09-05"])

            server.complete(listOf(log("a", "2026-09-06"), log("b", "2026-09-06")))
            loading.join()
            assertEquals(setOf("a", "b"), viewModel.takenByDate.value["2026-09-06"])
        }

    @Test
    fun aFailedToggleIsRevertedForItsOwnDay() =
        runTest {
            every { supplementRepo.cachedChecklist(any()) } returns emptyList()
            coEvery { supplementRepo.getChecklist(any()) } returns emptyList()
            coEvery { supplementRepo.logSupplement(any(), any()) } throws RuntimeException("offline")
            val viewModel = viewModel()
            viewModel.loadChecklist("2026-09-06")

            viewModel.setSupplementTaken("a", "2026-09-06", true)

            assertEquals(emptySet(), viewModel.takenByDate.value["2026-09-06"])
            coVerify { errorReporter.captureException(any()) }
        }
}
