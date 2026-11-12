package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.FoodEnrichmentJob
import com.bissbilanz.api.generated.model.FoodEnrichmentStatusResponse
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.FoodEnrichmentException
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.sync.ConnectivityProvider
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class EnhanceFoodsViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private val online = MutableStateFlow(true)
    private lateinit var foodRepo: FoodRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var viewModel: EnhanceFoodsViewModel

    private val poll = EnhanceFoodsViewModel.POLL_INTERVAL_MS

    private fun job(
        state: String,
        processed: Int = 0,
    ) = FoodEnrichmentJob(state, 5, processed, processed, 0, 0, "2026-11-12T10:00:00Z", null)

    private fun status(
        job: FoodEnrichmentJob? = null,
        candidates: Int = 5,
    ) = FoodEnrichmentStatusResponse(candidates = candidates, job = job)

    private val idle = status()
    private val queued = status(job("queued"))
    private val running = status(job("running", processed = 2))
    private val completed = status(job("completed", processed = 5), candidates = 0)

    private fun viewModel(local: Boolean = false): EnhanceFoodsViewModel {
        val connectivity = mockk<ConnectivityProvider> { every { isOnline } returns online }
        val appMode = mockk<AppModeManager> { every { isLocal } returns local }
        return EnhanceFoodsViewModel(foodRepo, connectivity, errorReporter, appMode)
    }

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        foodRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        viewModel = viewModel()
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun TestScope.showScreen() = backgroundScope.launch(testDispatcher) { viewModel.pollWhileVisible() }

    @Test
    fun aVisibleScreenReadsTheStatusOnceWithoutPollingWhenNoRunIsActive() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns idle

            showScreen()
            advanceTimeBy(poll * 5)

            assertEquals(idle, viewModel.state.value.status)
            assertTrue(viewModel.state.value.canStart)
            coVerify(exactly = 1) { foodRepo.foodEnrichmentStatus() }
        }

    @Test
    fun anActiveRunIsPolledUntilItFinishesAndThenTheFoodsAreRefreshed() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returnsMany listOf(running, running, completed)

            showScreen()
            coVerify(exactly = 1) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(poll - 1)
            coVerify(exactly = 1) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(2)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
            coVerify(exactly = 0) { foodRepo.refreshFoods(any(), any()) }
            advanceTimeBy(poll)
            coVerify(exactly = 3) { foodRepo.foodEnrichmentStatus() }
            coVerify(exactly = 1) { foodRepo.refreshFoods(any(), any()) }

            advanceTimeBy(poll * 10)

            coVerify(exactly = 3) { foodRepo.foodEnrichmentStatus() }
            assertEquals(completed, viewModel.state.value.status)
            assertFalse(viewModel.state.value.isActive)
        }

    @Test
    fun aRunThatWasAlreadyOverWhenTheScreenOpenedDoesNotRefreshTheFoods() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns completed

            showScreen()

            coVerify(exactly = 0) { foodRepo.refreshFoods(any(), any()) }
        }

    @Test
    fun pollingStopsWhenTheScreenGoesAway() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns running
            val screen = showScreen()
            advanceTimeBy(poll + 1)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }

            screen.cancel()
            advanceTimeBy(poll * 10)

            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
        }

    @Test
    fun failedReadsBackOffAreReportedAndStopAfterThreeUntilTheUserRetries() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns running andThenThrows RuntimeException("boom")

            showScreen()
            advanceTimeBy(poll + 1)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(poll * 2)
            coVerify(exactly = 3) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(poll * 4)
            coVerify(exactly = 4) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(poll * 20)
            coVerify(exactly = 4) { foodRepo.foodEnrichmentStatus() }
            assertTrue(viewModel.state.value.loadStalled)
            assertEquals(running, viewModel.state.value.status)
            verify(exactly = 3) { errorReporter.captureException(any()) }

            coEvery { foodRepo.foodEnrichmentStatus() } returns running
            viewModel.retry()
            coVerify(exactly = 5) { foodRepo.foodEnrichmentStatus() }
            assertFalse(viewModel.state.value.loadStalled)
            advanceTimeBy(poll + 1)
            coVerify(exactly = 6) { foodRepo.foodEnrichmentStatus() }
        }

    @Test
    fun aFailedFirstReadShowsTheErrorRightAway() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } throws RuntimeException("boom")

            showScreen()
            advanceTimeBy(poll * 10)

            assertTrue(viewModel.state.value.loadStalled)
            assertNull(viewModel.state.value.status)
            coVerify(exactly = 1) { foodRepo.foodEnrichmentStatus() }
        }

    @Test
    fun aRateLimitedReadWaitsForRetryAfterWithoutReporting() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns running andThenThrows
                FoodEnrichmentException(FoodEnrichmentException.Reason.RATE_LIMITED, retryAfterSeconds = 30)

            showScreen()
            advanceTimeBy(poll + 1)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(29_000)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(1_000)
            coVerify(exactly = 3) { foodRepo.foodEnrichmentStatus() }
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun offlineNothingIsReadUntilTheDeviceIsBackOnline() =
        runTest {
            online.value = false
            coEvery { foodRepo.foodEnrichmentStatus() } returns running

            showScreen()
            advanceTimeBy(poll * 5)
            coVerify(exactly = 0) { foodRepo.foodEnrichmentStatus() }

            online.value = true
            coVerify(exactly = 1) { foodRepo.foodEnrichmentStatus() }
            advanceTimeBy(poll + 1)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }

            online.value = false
            advanceTimeBy(poll * 5)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
        }

    @Test
    fun startingShowsTheQueuedRunAndPollingPicksItUp() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns idle
            coEvery { foodRepo.startFoodEnrichment() } returns queued
            showScreen()

            viewModel.start()

            assertTrue(viewModel.state.value.isActive)
            assertFalse(viewModel.state.value.busy)
            coEvery { foodRepo.foodEnrichmentStatus() } returns running
            advanceTimeBy(poll + 1)
            coVerify(exactly = 2) { foodRepo.foodEnrichmentStatus() }
            assertEquals(running, viewModel.state.value.status)
            coVerify(exactly = 1) { foodRepo.startFoodEnrichment() }
        }

    @Test
    fun aReadOvertakenByAStartIsDropped() =
        runTest {
            val gate = CompletableDeferred<FoodEnrichmentStatusResponse>()
            coEvery { foodRepo.foodEnrichmentStatus() } coAnswers { gate.await() }
            coEvery { foodRepo.startFoodEnrichment() } returns queued
            showScreen()

            viewModel.start()
            gate.complete(idle)

            assertEquals(queued, viewModel.state.value.status)
        }

    @Test
    fun stoppingCancelsTheRunAndRefreshesTheFoods() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns running
            coEvery { foodRepo.cancelFoodEnrichment() } returns status(job("cancelled", processed = 2))
            showScreen()

            viewModel.stop()

            assertFalse(viewModel.state.value.isActive)
            coVerify(exactly = 1) { foodRepo.cancelFoodEnrichment() }
            coVerify(exactly = 1) { foodRepo.refreshFoods(any(), any()) }
        }

    @Test
    fun aRateLimitedActionDisablesStartAndStopUntilRetryAfterHasPassed() =
        runTest {
            coEvery { foodRepo.foodEnrichmentStatus() } returns idle
            coEvery { foodRepo.startFoodEnrichment() } throws
                FoodEnrichmentException(FoodEnrichmentException.Reason.RATE_LIMITED, retryAfterSeconds = 20)
            showScreen()

            viewModel.start()
            assertTrue(viewModel.state.value.rateLimited)
            assertFalse(viewModel.state.value.canStart)
            viewModel.start()
            coVerify(exactly = 1) { foodRepo.startFoodEnrichment() }

            advanceTimeBy(20_001)

            assertFalse(viewModel.state.value.rateLimited)
            assertTrue(viewModel.state.value.canStart)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun startingOfflineSaysSoWithoutARequest() =
        runTest {
            online.value = false

            viewModel.start()

            assertEquals(UiMessage(R.string.enhance_foods_offline), viewModel.snackbarMessage.value)
            coVerify(exactly = 0) { foodRepo.startFoodEnrichment() }
        }

    @Test
    fun aConnectionLostDuringAnActionSaysOfflineWithoutReporting() =
        runTest {
            coEvery { foodRepo.startFoodEnrichment() } throws FoodEnrichmentException(FoodEnrichmentException.Reason.OFFLINE)

            viewModel.start()

            assertEquals(UiMessage(R.string.enhance_foods_offline), viewModel.snackbarMessage.value)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aFailedActionIsReportedAndShown() =
        runTest {
            coEvery { foodRepo.cancelFoodEnrichment() } throws RuntimeException("boom")

            viewModel.stop()

            assertEquals(UiMessage(R.string.enhance_foods_action_failed), viewModel.snackbarMessage.value)
            assertFalse(viewModel.state.value.busy)
            verify(exactly = 1) { errorReporter.captureException(any()) }
        }

    @Test
    fun aSecondTapWhileAnActionIsInFlightIsIgnored() =
        runTest {
            val gate = CompletableDeferred<FoodEnrichmentStatusResponse>()
            coEvery { foodRepo.startFoodEnrichment() } coAnswers { gate.await() }

            viewModel.start()
            assertTrue(viewModel.state.value.busy)
            viewModel.start()
            gate.complete(queued)

            assertFalse(viewModel.state.value.busy)
            coVerify(exactly = 1) { foodRepo.startFoodEnrichment() }
        }

    @Test
    fun localModeNeverTalksToTheServer() =
        runTest {
            viewModel = viewModel(local = true)

            showScreen()
            viewModel.start()
            viewModel.refresh()
            advanceTimeBy(poll * 5)

            assertTrue(viewModel.isLocalMode)
            coVerify(exactly = 0) { foodRepo.foodEnrichmentStatus() }
            coVerify(exactly = 0) { foodRepo.startFoodEnrichment() }
        }
}
