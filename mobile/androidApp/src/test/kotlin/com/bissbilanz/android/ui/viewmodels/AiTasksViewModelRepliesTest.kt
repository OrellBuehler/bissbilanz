package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskReplyAlerts
import com.bissbilanz.android.aitasks.AiTaskUploadQueue
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeProcessing
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.util.AI_TASK_REPLY_MAX_CHARS
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
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
import java.io.IOException
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class AiTasksViewModelRepliesTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var aiTaskRepo: AiTaskRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var replyAlerts: AiTaskReplyAlerts
    private lateinit var viewModel: AiTasksViewModel
    private val tasks = MutableStateFlow<List<AiTask>>(emptyList())
    private val online = MutableStateFlow(true)

    private fun message(
        id: String,
        role: String = "assistant",
        outcome: String? = if (role == "user") null else "answered",
        unread: Boolean = false,
    ) = AiTaskThreadMessage(
        id = id,
        role = role,
        text = "text of $id",
        outcome = outcome,
        createdAt = "2026-10-12T10:00:00Z",
        unread = unread,
    )

    private fun task(
        id: String = "t1",
        correctionState: String = "idle",
        messages: List<AiTaskThreadMessage> = emptyList(),
    ) = AiTask(
        id = id,
        userId = "u1",
        status = AiTask.Status.completed,
        description = "2 eggs",
        photoUrl = null,
        photoUrls = emptyList(),
        date = "2026-10-12",
        mealType = "Breakfast",
        eatenAt = null,
        source = "android",
        resultSummary = "Logged 2 eggs",
        createdEntryIds = listOf("e1"),
        completedAt = null,
        dismissedAt = null,
        acknowledgedAt = null,
        processedBy = AiTask.ProcessedBy.assistant,
        processedByKind = "claude",
        claudeThread =
            AiTaskClaudeThread(
                messages = messages,
                correctionState = correctionState,
                canReply = correctionState == "idle" || correctionState == "failed",
                replyBlockedReason = null,
                repliesRemaining = 5,
                unreadReplies = messages.count { it.unread },
            ),
    )

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        aiTaskRepo =
            mockk(relaxed = true) {
                every { tasks } returns this@AiTasksViewModelRepliesTest.tasks
            }
        coEvery { aiTaskRepo.reply(any(), any(), any()) } returns task(correctionState = "queued")
        coEvery { aiTaskRepo.markRepliesRead(any(), any()) } returns true
        errorReporter = mockk(relaxed = true)
        replyAlerts = mockk(relaxed = true)
        val uploadQueue: AiTaskUploadQueue = mockk(relaxed = true) { every { items } returns MutableStateFlow(emptyList()) }
        val entryRepo: EntryRepository = mockk(relaxed = true)
        val connectivity: ConnectivityProvider = mockk { every { isOnline } returns online }
        viewModel = AiTasksViewModel(aiTaskRepo, uploadQueue, errorReporter, entryRepo, connectivity, replyAlerts, SavedStateHandle())
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun TestScope.collectMessages(): MutableList<Int> {
        val messages = mutableListOf<Int>()
        backgroundScope.launch(testDispatcher) { viewModel.messages.collect { messages += it } }
        return messages
    }

    private fun draft(taskId: String = "t1") = viewModel.replyDrafts.value[taskId]

    private fun AiTaskThreadMessage.withText(text: String) = copy(text = text)

    private fun failWith(
        status: Int,
        body: String? = null,
        retryAfter: Long? = null,
    ) = ApiException("HTTP $status", status, responseBody = body, retryAfterSeconds = retryAfter)

    private fun coded(code: String) = """{"error":"rejected","code":"$code"}"""

    private fun sentKeys(): List<String> {
        val keys = mutableListOf<String>()
        coVerify { aiTaskRepo.reply("t1", any(), capture(keys)) }
        return keys
    }

    @Test
    fun aReplySendsTheTrimmedTextAndClearsTheDraft() =
        runTest {
            viewModel.updateReplyText("t1", "  It was 3 eggs \n")

            viewModel.sendReply("t1")

            coVerify(exactly = 1) { aiTaskRepo.reply("t1", "It was 3 eggs", any()) }
            assertNull(draft())
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aRetryOfTheSameTextKeepsItsKey() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("timeout") andThen task(correctionState = "queued")
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")
            assertEquals(ReplyFailure.NETWORK, draft()?.failure)
            assertEquals("It was 3 eggs", draft()?.text)
            viewModel.updateReplyText("t1", "It was 3 eggs ")
            viewModel.sendReply("t1")

            val keys = sentKeys()
            assertEquals(2, keys.size)
            assertEquals(keys[0], keys[1])
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun changedTextGetsANewKey() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("timeout")
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "It was 4 eggs")

            viewModel.sendReply("t1")

            val keys = sentKeys()
            assertEquals(2, keys.size)
            assertNotEquals(keys[0], keys[1])
        }

    @Test
    fun theNextReplyAfterASuccessGetsANewKey() =
        runTest {
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")

            val keys = sentKeys()
            assertEquals(2, keys.size)
            assertNotEquals(keys[0], keys[1])
        }

    @Test
    fun aKeyTheServerSaysWasReusedIsReplacedAndReported() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws failWith(422, """{"error":"idempotency_key_reused"}""")
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")

            viewModel.sendReply("t1")

            val keys = sentKeys()
            assertNotEquals(keys[0], keys[1])
            assertEquals(ReplyFailure.UNKNOWN, draft()?.failure)
            verify(exactly = 2) { errorReporter.captureException(any()) }
        }

    @Test
    fun blankOrTooLongTextIsNotSent() =
        runTest {
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "   ")
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "x".repeat(AI_TASK_REPLY_MAX_CHARS + 1))
            assertFalse(draft()?.canSend ?: true)
            viewModel.sendReply("t1")

            coVerify(exactly = 0) { aiTaskRepo.reply(any(), any(), any()) }
            viewModel.updateReplyText("t1", " " + "x".repeat(AI_TASK_REPLY_MAX_CHARS) + " ")
            assertTrue(draft()?.canSend ?: false)
        }

    @Test
    fun aSecondTapWhileSendingIsIgnoredAndTheTextCannotChange() =
        runTest {
            val gate = CompletableDeferred<AiTask>()
            coEvery { aiTaskRepo.reply(any(), any(), any()) } coAnswers { gate.await() }
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")
            assertEquals(true, draft()?.sending)
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "changed while sending")
            gate.complete(task(correctionState = "queued"))

            coVerify(exactly = 1) { aiTaskRepo.reply("t1", "It was 3 eggs", any()) }
            assertNull(draft())
        }

    @Test
    fun offlineTheReplyIsNotSentAndTheTextIsKept() =
        runTest {
            online.value = false
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")

            coVerify(exactly = 0) { aiTaskRepo.reply(any(), any(), any()) }
            assertEquals(ReplyFailure.OFFLINE, draft()?.failure)
            assertEquals("It was 3 eggs", draft()?.text)
        }

    @Test
    fun everyRejectionExplainsItselfKeepsTheTextAndIsNotReported() =
        runTest {
            val messages = collectMessages()
            val cases =
                listOf(
                    failWith(403, coded("processor_unavailable")) to R.string.ai_tasks_reply_blocked_unavailable,
                    failWith(403, coded("budget_exhausted")) to R.string.ai_tasks_reply_blocked_budget,
                    failWith(403, coded("future_reason")) to R.string.ai_tasks_reply_blocked_other,
                    failWith(409, coded("not_processed_by_server")) to R.string.ai_tasks_reply_blocked_not_server,
                    failWith(409, coded("not_completed")) to R.string.ai_tasks_reply_blocked_not_completed,
                    failWith(409, coded("correction_in_flight")) to R.string.ai_tasks_reply_blocked_in_flight,
                    failWith(409, coded("reply_limit_reached")) to R.string.ai_tasks_reply_blocked_limit,
                    failWith(409, """{"error":"conflict"}""") to R.string.ai_tasks_reply_blocked_other,
                    failWith(429, coded("rate_limited")) to R.string.ai_tasks_reply_blocked_rate,
                    failWith(429, coded("failed_too_often")) to R.string.ai_tasks_reply_blocked_failing,
                )
            for ((error, expected) in cases) {
                coEvery { aiTaskRepo.reply(any(), any(), any()) } throws error
                viewModel.updateReplyText("t1", "It was 3 eggs")

                viewModel.sendReply("t1")

                assertEquals(expected, messages.last())
                assertEquals("It was 3 eggs", draft()?.text)
                assertEquals(false, draft()?.sending)
                assertNull(draft()?.failure)
            }
            assertEquals(cases.size, messages.size)
            verify(exactly = 0) { errorReporter.captureException(any()) }
            val keys = sentKeys()
            assertEquals(1, keys.toSet().size)
        }

    @Test
    fun aRateLimitHoldsTheSendButtonForItsRetryAfter() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws failWith(429, coded("rate_limited"), retryAfter = 3600)
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")

            assertEquals(true, draft()?.waiting)
            assertEquals(3600L, draft()?.retryAfterSeconds)
            assertFalse(draft()?.canSend ?: true)
            viewModel.sendReply("t1")
            coVerify(exactly = 1) { aiTaskRepo.reply(any(), any(), any()) }

            advanceTimeBy(3_600_001)

            assertEquals(false, draft()?.waiting)
            assertNull(draft()?.retryAfterSeconds)
            assertTrue(draft()?.canSend ?: false)
        }

    @Test
    fun theGenericLimiterShowsTooManyRequestsWithItsRetryAfter() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws failWith(429, """{"error":"Too many requests"}""", retryAfter = 30)
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")

            assertEquals(ReplyFailure.TOO_MANY_REQUESTS, draft()?.failure)
            assertEquals(30L, draft()?.retryAfterSeconds)
            assertEquals(emptyList(), messages)
            viewModel.updateReplyText("t1", "It was 3 eggs!")
            assertEquals(ReplyFailure.TOO_MANY_REQUESTS, draft()?.failure)
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aRequestStillInProgressWaitsAndRetriesWithTheSameKey() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws
                failWith(503, """{"error":"request_in_progress"}""") andThen task(correctionState = "queued")
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")
            assertEquals(ReplyFailure.STILL_SENDING, draft()?.failure)
            assertEquals(AiTasksViewModel.DEFAULT_IN_PROGRESS_WAIT_SECONDS, draft()?.retryAfterSeconds)
            viewModel.sendReply("t1")
            coVerify(exactly = 1) { aiTaskRepo.reply(any(), any(), any()) }

            advanceTimeBy(AiTasksViewModel.DEFAULT_IN_PROGRESS_WAIT_SECONDS * 1000 + 1)
            assertNull(draft()?.failure)
            viewModel.sendReply("t1")

            val keys = sentKeys()
            assertEquals(2, keys.size)
            assertEquals(keys[0], keys[1])
            assertNull(draft())
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun aGoneTaskDropsItsDraftAndSaysSo() =
        runTest {
            val messages = collectMessages()
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws failWith(404, coded("task_not_found"))
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")

            assertEquals(listOf(R.string.ai_tasks_reply_task_gone), messages)
            assertNull(draft())
            verify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun failuresThatKeepTheComposerShowInlineAndOnlyUnexpectedOnesAreReported() =
        runTest {
            val cases =
                listOf(
                    failWith(400, """{"error":"Validation failed"}""") to (ReplyFailure.INVALID to true),
                    failWith(401, """{"error":"Unauthorized"}""") to (ReplyFailure.SIGNED_OUT to false),
                    UnauthorizedException() to (ReplyFailure.SIGNED_OUT to false),
                    IOException("offline") to (ReplyFailure.NETWORK to false),
                    failWith(500, """{"error":"boom"}""") to (ReplyFailure.NETWORK to true),
                    failWith(503, "<html>maintenance</html>") to (ReplyFailure.NETWORK to true),
                    IllegalStateException("decode") to (ReplyFailure.UNKNOWN to true),
                )
            for ((error, expected) in cases) {
                val (failure, reported) = expected
                coEvery { aiTaskRepo.reply(any(), any(), any()) } throws error
                viewModel.updateReplyText("t1", "It was 3 eggs")

                viewModel.sendReply("t1")

                assertEquals(failure, draft()?.failure, error.toString())
                assertEquals("It was 3 eggs", draft()?.text)
                verify(exactly = if (reported) 1 else 0) { errorReporter.captureException(error) }
            }
        }

    @Test
    fun editingTheTextClearsAFailure() =
        runTest {
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("offline")
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")

            viewModel.updateReplyText("t1", "It was 3 eggs, scrambled")

            assertNull(draft()?.failure)
        }

    @Test
    fun aListReadDuringASendLeavesTheSendInCharge() =
        runTest {
            val gate = CompletableDeferred<AiTask>()
            val replied = task(correctionState = "queued", messages = listOf(message("u1", role = "user")))
            coEvery { aiTaskRepo.reply(any(), any(), any()) } coAnswers { gate.await() }
            coEvery { aiTaskRepo.refresh() } coAnswers { tasks.value = listOf(task()) }
            tasks.value = listOf(task())
            viewModel.updateReplyText("t1", "It was 3 eggs")

            viewModel.sendReply("t1")
            viewModel.refresh()

            assertEquals(true, draft()?.sending)
            assertEquals("It was 3 eggs", draft()?.text)
            gate.complete(replied)
            assertNull(draft())
        }

    @Test
    fun onlyAnswersActuallyOnScreenAreMarkedReadAndTheyStayNewForTheVisit() =
        runTest {
            tasks.value =
                listOf(
                    task("t1", "idle", listOf(message("u1", role = "user"), message("a1", unread = true), message("a2"))),
                    task("t2", "idle", listOf(message("a3", unread = true))),
                )
            val displayed = MutableStateFlow(setOf("a1"))
            backgroundScope.launch(testDispatcher) { viewModel.markDisplayedRepliesRead(displayed) }

            coVerify(exactly = 1) { aiTaskRepo.markRepliesRead(setOf("a1"), false) }
            assertEquals(setOf("a1"), viewModel.newReplyIds.value)

            displayed.value = setOf("a1", "a2", "a3")

            coVerify(exactly = 1) { aiTaskRepo.markRepliesRead(setOf("a1", "a3"), false) }
            assertEquals(setOf("a1", "a3"), viewModel.newReplyIds.value)
            coVerify(exactly = 0) { aiTaskRepo.acknowledgeAll(any()) }
        }

    @Test
    fun answersOnScreenCancelTheirNotificationOnceEvenWhileOffline() =
        runTest {
            online.value = false
            tasks.value = listOf(task("t1", "idle", listOf(message("a1", unread = true), message("a2"))))
            val displayed = MutableStateFlow(setOf("a1", "a2"))
            backgroundScope.launch(testDispatcher) { viewModel.markDisplayedRepliesRead(displayed) }

            verify(exactly = 1) { replyAlerts.shown(setOf("a1", "a2")) }
            coVerify(exactly = 0) { aiTaskRepo.markRepliesRead(any(), any()) }

            displayed.value = emptySet()
            displayed.value = setOf("a1", "a2")

            verify(exactly = 1) { replyAlerts.shown(any()) }
        }

    @Test
    fun answersAreMarkedReadOnceTheDeviceIsBackOnline() =
        runTest {
            online.value = false
            tasks.value = listOf(task("t1", "idle", listOf(message("a1", unread = true))))
            backgroundScope.launch(testDispatcher) { viewModel.markDisplayedRepliesRead(MutableStateFlow(setOf("a1"))) }

            coVerify(exactly = 0) { aiTaskRepo.markRepliesRead(any(), any()) }

            online.value = true

            coVerify(exactly = 1) { aiTaskRepo.markRepliesRead(setOf("a1"), false) }
        }

    @Test
    fun aFailedReadMarkIsRetriedQuietlyWhileTheAnswerStaysOnScreen() =
        runTest {
            coEvery { aiTaskRepo.markRepliesRead(any(), any()) } returns false andThen false andThen true
            tasks.value = listOf(task("t1", "idle", listOf(message("a1", unread = true))))
            backgroundScope.launch(testDispatcher) { viewModel.markDisplayedRepliesRead(MutableStateFlow(setOf("a1"))) }

            coVerify(exactly = 1) { aiTaskRepo.markRepliesRead(setOf("a1"), false) }
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS)
            coVerify(exactly = 2) { aiTaskRepo.markRepliesRead(setOf("a1"), true) }
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS * 3)
            coVerify(exactly = 3) { aiTaskRepo.markRepliesRead(any(), any()) }
        }

    @Test
    fun aNewAnswerOnScreenIsMarkedReadWhenItArrives() =
        runTest {
            tasks.value = listOf(task("t1", "running", listOf(message("u1", role = "user"))))
            val displayed = MutableStateFlow(emptySet<String>())
            backgroundScope.launch(testDispatcher) { viewModel.markDisplayedRepliesRead(displayed) }
            coVerify(exactly = 0) { aiTaskRepo.markRepliesRead(any(), any()) }

            tasks.value =
                listOf(task("t1", "idle", listOf(message("u1", role = "user"), message("a1", outcome = "changed", unread = true))))
            displayed.value = setOf("a1")

            coVerify(exactly = 1) { aiTaskRepo.markRepliesRead(setOf("a1"), false) }
        }

    @Test
    fun theScreenStaysMarkedVisibleForAsLongAsItIsShownAndPollsOnce() =
        runTest {
            var visible = 0
            coEvery { replyAlerts.whileListVisible(any()) } coAnswers {
                visible++
                try {
                    firstArg<suspend () -> Unit>().invoke()
                } finally {
                    visible--
                }
            }
            tasks.value = listOf(task(correctionState = "running"))

            val first = backgroundScope.launch(testDispatcher) { viewModel.whileScreenVisible() }
            val second = backgroundScope.launch(testDispatcher) { viewModel.whileScreenVisible() }
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)

            assertEquals(2, visible)
            coVerify(exactly = 1) { aiTaskRepo.refresh() }
            first.cancel()
            second.cancel()
            assertEquals(0, visible)
        }

    @Test
    fun aSentReplySchedulesAFollowUpCheck() =
        runTest {
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")

            verify(exactly = 1) { replyAlerts.scheduleCheck() }

            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("offline")
            viewModel.updateReplyText("t1", "Again")
            viewModel.sendReply("t1")

            verify(exactly = 1) { replyAlerts.scheduleCheck() }
        }

    @Test
    fun aReplyTheServerTookDespiteALostResponseClearsTheDraftOnceTheThreadShowsIt() =
        runTest {
            tasks.value = listOf(task("t1", "idle", listOf(message("u0", role = "user"), message("a0"))))
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("timeout")
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")
            assertEquals(ReplyFailure.NETWORK, draft()?.failure)

            tasks.value =
                listOf(
                    task(
                        "t1",
                        "running",
                        listOf(message("u0", role = "user"), message("a0"), message("u1", role = "user").withText("It was 3 eggs")),
                    ),
                )

            assertNull(draft())
            coEvery { aiTaskRepo.reply(any(), any(), any()) } returns task(correctionState = "queued")
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")
            val keys = sentKeys()
            assertNotEquals(keys[0], keys[1])
        }

    @Test
    fun anOlderMessageWithTheSameTextDoesNotCountAsTheReply() =
        runTest {
            tasks.value = listOf(task("t1", "idle", listOf(message("u0", role = "user").withText("Try again"), message("a0"))))
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws IOException("timeout")
            viewModel.updateReplyText("t1", "Try again")
            viewModel.sendReply("t1")

            tasks.value = tasks.value.map { it.copy(resultSummary = "touched") }

            assertEquals("Try again", draft()?.text)
            assertEquals(ReplyFailure.NETWORK, draft()?.failure)
        }

    @Test
    fun anEditedDraftSurvivesTheReplyBeingFoundButLosesTheStaleFailure() =
        runTest {
            tasks.value = listOf(task("t1", "idle"))
            coEvery { aiTaskRepo.reply(any(), any(), any()) } throws failWith(503, """{"error":"request_in_progress"}""", retryAfter = 30)
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")
            viewModel.updateReplyText("t1", "Also the toast")
            assertEquals(ReplyFailure.STILL_SENDING, draft()?.failure)

            tasks.value = listOf(task("t1", "running", listOf(message("u1", role = "user").withText("It was 3 eggs"))))

            assertEquals("Also the toast", draft()?.text)
            assertNull(draft()?.failure)
            assertEquals(false, draft()?.waiting)
            assertTrue(draft()?.canSend ?: false)
        }

    @Test
    fun aReadDuringTheSendDoesNotDropTheDraftButAFailureAfterwardsDoes() =
        runTest {
            tasks.value = listOf(task("t1", "idle"))
            val gate = CompletableDeferred<AiTask>()
            coEvery { aiTaskRepo.reply(any(), any(), any()) } coAnswers { gate.await() }
            viewModel.updateReplyText("t1", "It was 3 eggs")
            viewModel.sendReply("t1")

            tasks.value = listOf(task("t1", "queued", listOf(message("u1", role = "user").withText("It was 3 eggs"))))
            assertEquals(true, draft()?.sending)

            gate.completeExceptionally(IOException("timeout"))

            assertNull(draft())
        }

    @Test
    fun unreadAnswersOpenTheCompletedTab() =
        runTest {
            backgroundScope.launch(testDispatcher) { viewModel.filter.collect {} }
            every { aiTaskRepo.unreadCount() } returns 0
            every { aiTaskRepo.unreadReplyCount() } returns 1

            viewModel.load()

            assertEquals(AiTasksViewModel.Filter.COMPLETED, viewModel.filter.value)
        }

    @Test
    fun unreadDismissalsStillWinOverUnreadAnswers() =
        runTest {
            backgroundScope.launch(testDispatcher) { viewModel.filter.collect {} }
            every { aiTaskRepo.unreadCount() } returns 1
            every { aiTaskRepo.unreadReplyCount() } returns 1

            viewModel.load()

            assertEquals(AiTasksViewModel.Filter.DISMISSED, viewModel.filter.value)
            coVerify(exactly = 1) { aiTaskRepo.acknowledgeAll() }
        }

    @Test
    fun aCorrectionInProgressIsPolledUntilItSettles() =
        runTest {
            tasks.value = listOf(task(correctionState = "queued"))
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }

            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)
            coVerify(exactly = 1) { aiTaskRepo.refresh() }
            tasks.value = listOf(task(correctionState = "retrying"))
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS)
            coVerify(exactly = 2) { aiTaskRepo.refresh() }

            tasks.value = listOf(task(correctionState = "idle", messages = listOf(message("a1", unread = true))))
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS * 3)
            coVerify(exactly = 2) { aiTaskRepo.refresh() }
        }

    @Test
    fun anUnknownCorrectionStateIsNotPolled() =
        runTest {
            tasks.value = listOf(task(correctionState = "contemplating"))
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }

            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS * 3)

            coVerify(exactly = 0) { aiTaskRepo.refresh() }
        }

    @Test
    fun pollingPausesWhileOffline() =
        runTest {
            tasks.value = listOf(task(correctionState = "running"))
            online.value = false
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }

            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS * 3)
            coVerify(exactly = 0) { aiTaskRepo.refresh() }

            online.value = true
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)
            coVerify(exactly = 1) { aiTaskRepo.refresh() }
        }

    @Test
    fun aSecondPollerDoesNotDoubleTheReads() =
        runTest {
            tasks.value = listOf(task(correctionState = "running"))
            val first = backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }

            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)
            coVerify(exactly = 1) { aiTaskRepo.refresh() }

            first.cancel()
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }
            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)
            coVerify(exactly = 2) { aiTaskRepo.refresh() }
        }

    @Test
    fun aPendingRunStillPollsAlongsideCorrections() =
        runTest {
            val pending =
                task().copy(
                    status = AiTask.Status.pending,
                    claudeThread = null,
                    claudeProcessing = AiTaskClaudeProcessing(state = "running", proposal = null),
                )
            tasks.value = listOf(pending)
            backgroundScope.launch(testDispatcher) { viewModel.pollWhileClaudeWorks() }

            advanceTimeBy(AiTasksViewModel.POLL_INTERVAL_MS + 1)

            coVerify(exactly = 1) { aiTaskRepo.refresh() }
            coVerify(exactly = 1) { aiTaskRepo.acknowledgeAll(quiet = true) }
        }

    @Test
    fun aDraftForOneTaskDoesNotTouchAnother() =
        runTest {
            val captured = slot<String>()
            coEvery { aiTaskRepo.reply("t2", any(), capture(captured)) } throws IOException("offline")
            viewModel.updateReplyText("t1", "first")
            viewModel.updateReplyText("t2", "second")

            viewModel.sendReply("t2")

            assertEquals("first", draft("t1")?.text)
            assertNull(draft("t1")?.failure)
            assertEquals(ReplyFailure.NETWORK, draft("t2")?.failure)
            assertTrue(captured.isCaptured)
        }
}
