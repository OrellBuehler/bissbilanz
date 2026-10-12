package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadQueue
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.EntryRepository
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
class AiTasksViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var aiTaskRepo: AiTaskRepository
    private lateinit var entryRepo: EntryRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var viewModel: AiTasksViewModel

    private val completed =
        AiTask(
            id = "t1",
            userId = "u1",
            status = AiTask.Status.completed,
            description = "2 eggs",
            photoUrl = null,
            photoUrls = emptyList(),
            date = "2026-10-12",
            mealType = "Breakfast",
            eatenAt = null,
            source = "android",
            resultSummary = null,
            createdEntryIds = listOf("i1"),
            completedAt = null,
            dismissedAt = null,
            acknowledgedAt = null,
            processedBy = AiTask.ProcessedBy.assistant,
            processedByKind = "claude",
        )

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        aiTaskRepo =
            mockk(relaxed = true) {
                every { tasks } returns MutableStateFlow(emptyList())
            }
        entryRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        val uploadQueue: AiTaskUploadQueue =
            mockk(relaxed = true) {
                every { items } returns MutableStateFlow(emptyList())
            }
        viewModel = AiTasksViewModel(aiTaskRepo, uploadQueue, errorReporter, entryRepo, SavedStateHandle())
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun kotlinx.coroutines.test.TestScope.collectMessages(): MutableList<Int> {
        val messages = mutableListOf<Int>()
        backgroundScope.launch(testDispatcher) { viewModel.messages.collect { messages += it } }
        return messages
    }

    @Test
    fun acceptingLogsAndRefreshesTheEntriesOfTheTaskDate() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", listOf("i1")) } returns completed

            viewModel.acceptProposal("t1", listOf("i1"))

            assertEquals(listOf(R.string.ai_tasks_proposal_logged), messages)
            assertNull(viewModel.busyTaskId.value)
            coVerify(exactly = 1) { entryRepo.refresh("2026-10-12") }
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aConflictShowsTheConflictMessageWithoutReporting() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } throws ApiException("conflict", 409)

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_conflict), messages)
            assertNull(viewModel.busyTaskId.value)
            verify(exactly = 0) { errorReporter.captureException(any()) }
            coVerify(exactly = 0) { entryRepo.refresh(any()) }
        }

    @Test
    fun aMissingTaskShowsTheConflictMessageWithoutReporting() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } throws ApiException("gone", 404)

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_conflict), messages)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aRateLimitShowsTheFailureMessageWithoutReporting() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } throws ApiException("slow down", 429)

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_failed), messages)
            assertNull(viewModel.busyTaskId.value)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun anyOtherFailureIsReportedAndShowsTheFailureMessage() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } throws ApiException("boom", 500)

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_failed), messages)
            assertNull(viewModel.busyTaskId.value)
            verify(exactly = 1) { errorReporter.captureException(any()) }
        }

    @Test
    fun anOfflineFailureIsReportedAndKeepsTheCardUsable() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } throws java.io.IOException("offline")

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_failed), messages)
            assertNull(viewModel.busyTaskId.value)
        }

    @Test
    fun theBusyStateBlocksASecondRequestAndClearsAfterwards() =
        runTest {
            val gate = CompletableDeferred<AiTask>()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } coAnswers { gate.await() }

            viewModel.acceptProposal("t1", null)
            assertEquals("t1", viewModel.busyTaskId.value)
            viewModel.acceptProposal("t1", null)
            viewModel.discardProposal("t1")
            gate.complete(completed)

            assertNull(viewModel.busyTaskId.value)
            coVerify(exactly = 1) { aiTaskRepo.acceptProposal("t1", null) }
            coVerify(exactly = 0) { aiTaskRepo.dismiss(any()) }
        }

    @Test
    fun theBusyStateIsClearedBeforeTheEntriesAreRefreshed() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } returns completed
            coEvery { entryRepo.refresh("2026-10-12") } coAnswers { gate.await() }

            viewModel.acceptProposal("t1", null)

            assertNull(viewModel.busyTaskId.value)
            gate.complete(Unit)
        }

    @Test
    fun aFailedEntryRefreshIsReportedButNotShownAsAFailure() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.acceptProposal("t1", null) } returns completed
            coEvery { entryRepo.refresh("2026-10-12") } throws RuntimeException("offline")

            viewModel.acceptProposal("t1", null)

            assertEquals(listOf(R.string.ai_tasks_proposal_logged), messages)
            verify(exactly = 1) { errorReporter.captureException(any()) }
        }

    @Test
    fun discardingDismissesTheTask() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.dismiss("t1") } returns completed

            viewModel.discardProposal("t1")

            assertEquals(emptyList(), messages)
            assertNull(viewModel.busyTaskId.value)
            coVerify(exactly = 1) { aiTaskRepo.dismiss("t1") }
        }

    @Test
    fun discardingAGoneProposalRefreshesTheListAndExplainsWithoutReporting() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.dismiss("t1") } throws ApiException("conflict", 409)

            viewModel.discardProposal("t1")

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_conflict), messages)
            coVerify(exactly = 1) { aiTaskRepo.refresh() }
            verify(exactly = 0) { errorReporter.captureException(any()) }
            assertNull(viewModel.busyTaskId.value)
        }

    @Test
    fun aMissingTaskOnDiscardIsTreatedLikeAConflict() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.dismiss("t1") } throws ApiException("gone", 404)

            viewModel.discardProposal("t1")

            assertEquals(listOf(R.string.ai_tasks_proposal_accept_conflict), messages)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun otherDiscardFailuresAreReported() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.dismiss("t1") } throws ApiException("boom", 500)

            viewModel.discardProposal("t1")

            assertEquals(listOf(R.string.ai_task_save_failed), messages)
            verify(exactly = 1) { errorReporter.captureException(any()) }
            assertNull(viewModel.busyTaskId.value)
        }
}
