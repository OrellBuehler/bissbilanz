package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.AiTaskReplyResult
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.api.generated.model.AiTaskUpdate
import com.bissbilanz.api.generated.model.AiTasksResponse
import com.bissbilanz.mode.AppMode
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.util.unreadReplies
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AiTaskRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var repository: AiTaskRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        repository = AiTaskRepository(api, NoopErrorReporter(), appModeManager())
    }

    @Test
    fun refreshCachesTasksOnSuccess() =
        runTest {
            val tasks = listOf(TestFixtures.aiTask(id = "1"), TestFixtures.aiTask(id = "2"))
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = tasks, total = tasks.size)

            repository.refresh()

            assertEquals(listOf("1", "2"), repository.tasks.value.map { it.id })
        }

    @Test
    fun aListReadThatStartedBeforeALocalAcceptIsDropped() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            val staleRead = CompletableDeferred<AiTasksResponse>()
            coEvery { api.listAiTasks(limit = 100) } coAnswers { staleRead.await() }
            val completed = pending.copy(status = AiTask.Status.completed)
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } returns completed

            val inFlight = launch { repository.refresh() }
            runCurrent()
            repository.acceptProposal("1", listOf("i1"))
            staleRead.complete(AiTasksResponse(tasks = listOf(pending), total = 1))
            inFlight.join()

            assertEquals(listOf(AiTask.Status.completed), repository.tasks.value.map { it.status })
        }

    @Test
    fun aListReadThatStartedBeforeALocalDeleteIsDropped() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            val staleRead = CompletableDeferred<AiTasksResponse>()
            coEvery { api.listAiTasks(limit = 100) } coAnswers { staleRead.await() }
            coEvery { api.deleteAiTask("1") } returns Unit

            val inFlight = launch { repository.refresh() }
            runCurrent()
            repository.delete("1")
            staleRead.complete(AiTasksResponse(tasks = listOf(pending), total = 1))
            inFlight.join()

            assertEquals(emptyList(), repository.tasks.value)
        }

    @Test
    fun refreshRethrowsInsteadOfSwallowing() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } throws RuntimeException("network down")

            try {
                repository.refresh()
                assertTrue(false, "should have thrown")
            } catch (e: RuntimeException) {
                assertEquals("network down", e.message)
            }
        }

    @Test
    fun refreshDoesNothingInLocalMode() =
        runTest {
            val local = AiTaskRepository(api, NoopErrorReporter(), appModeManager(AppMode.LOCAL))

            local.refresh()

            coVerify(exactly = 0) { api.listAiTasks(limit = 100) }
            assertTrue(local.tasks.value.isEmpty())
        }

    @Test
    fun deleteRemovesTheTaskFromTheList() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } returns
                AiTasksResponse(tasks = listOf(TestFixtures.aiTask(id = "1"), TestFixtures.aiTask(id = "2")), total = 2)
            repository.refresh()
            coEvery { api.deleteAiTask("1") } returns Unit

            repository.delete("1")

            assertEquals(listOf("2"), repository.tasks.value.map { it.id })
        }

    /**
     * An edit PATCHes the server and must replace the cached row with whatever the
     * server actually stored — not merge or drop it — so an edited description or
     * meal type shows up without waiting for the next refresh.
     */
    @Test
    fun updateReplacesTheTaskInPlace() =
        runTest {
            val original = TestFixtures.aiTask(id = "1", description = "Oatmeal")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(original), total = 1)
            repository.refresh()

            val update = AiTaskUpdate(description = "Oatmeal with berries")
            val serverResult = original.copy(description = "Oatmeal with berries")
            coEvery { api.updateAiTask("1", update, clearedKeys = listOf("mealType")) } returns serverResult

            val result = repository.update("1", update, listOf("mealType"))

            assertEquals("Oatmeal with berries", result.description)
            assertEquals(listOf("Oatmeal with berries"), repository.tasks.value.map { it.description })
        }

    @Test
    fun uploadPhotosDelegatesToTheApi() =
        runTest {
            val photos = listOf("meal_0.jpg" to byteArrayOf(1, 2, 3))
            coEvery { api.uploadAiTaskPhotos(photos) } returns listOf("/uploads/new.webp")

            val urls = repository.uploadPhotos(photos)

            assertEquals(listOf("/uploads/new.webp"), urls)
            coVerify { api.uploadAiTaskPhotos(photos) }
        }

    @Test
    fun acceptingAProposalSwapsInTheCompletedTask() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            val completed =
                pending.copy(status = AiTask.Status.completed, processedBy = AiTask.ProcessedBy.assistant, processedByKind = "claude")
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } returns completed

            val result = repository.acceptProposal("1", listOf("i1"))

            assertEquals(completed, result)
            assertEquals(listOf(AiTask.Status.completed), repository.tasks.value.map { it.status })
        }

    @Test
    fun aConflictRefreshesTheListAndRethrows() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            val reopened = pending.copy(status = AiTask.Status.completed)
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } throws ApiException("conflict", 409)
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(reopened), total = 1)

            val error = assertFailsWith<ApiException> { repository.acceptProposal("1", listOf("i1")) }

            assertEquals(409, error.statusCode)
            assertEquals(listOf(AiTask.Status.completed), repository.tasks.value.map { it.status })
        }

    @Test
    fun aRejectedAcceptRefreshesTheListAndRethrows() =
        runTest {
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } throws ApiException("stale ids", 400)
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = emptyList(), total = 0)

            val error = assertFailsWith<ApiException> { repository.acceptProposal("1", listOf("i1")) }

            assertEquals(400, error.statusCode)
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun aMissingTaskRefreshesTheListAndRethrows() =
        runTest {
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } throws ApiException("gone", 404)
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = emptyList(), total = 0)

            val error = assertFailsWith<ApiException> { repository.acceptProposal("1", listOf("i1")) }

            assertEquals(404, error.statusCode)
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun aConflictStillThrowsWhenTheRefreshFailsToo() =
        runTest {
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } throws ApiException("conflict", 409)
            coEvery { api.listAiTasks(limit = 100) } throws RuntimeException("offline")

            val error = assertFailsWith<ApiException> { repository.acceptProposal("1", listOf("i1")) }

            assertEquals(409, error.statusCode)
            assertEquals("offline", error.suppressed.single().message)
        }

    @Test
    fun anotherFailureLeavesTheListAlone() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            coEvery { api.acceptAiTaskProposal("1", listOf("i1")) } throws ApiException("boom", 500)

            assertFailsWith<ApiException> { repository.acceptProposal("1", listOf("i1")) }

            assertEquals(listOf(pending), repository.tasks.value)
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun dismissingSendsTheDismissedStatus() =
        runTest {
            val pending = TestFixtures.aiTask(id = "1")
            coEvery { api.listAiTasks(limit = 100) } returns AiTasksResponse(tasks = listOf(pending), total = 1)
            repository.refresh()
            val update = AiTaskUpdate(status = AiTaskUpdate.Status.dismissed)
            coEvery { api.updateAiTask("1", update, clearedKeys = emptyList()) } returns pending.copy(status = AiTask.Status.dismissed)

            repository.dismiss("1")

            assertEquals(listOf(AiTask.Status.dismissed), repository.tasks.value.map { it.status })
        }

    private fun answered(
        id: String = "1",
        date: String = "2024-01-15",
        messages: List<AiTaskThreadMessage> = emptyList(),
        correctionState: String = "idle",
    ) = TestFixtures.aiTask(
        id = id,
        status = AiTask.Status.completed,
        date = date,
        processedBy = AiTask.ProcessedBy.assistant,
        processedByKind = "claude",
        claudeThread = TestFixtures.claudeThread(*messages.toTypedArray(), correctionState = correctionState),
    )

    private fun list(vararg tasks: AiTask) = AiTasksResponse(tasks = tasks.toList(), total = tasks.size)

    private fun rejection(
        status: Int,
        code: String?,
    ) = ApiException(
        "rejected",
        status,
        null,
        if (code == null) """{"error":"slow down"}""" else """{"error":"rejected","code":"$code"}""",
    )

    @Test
    fun aReplySwapsInTheTaskTheServerAnswered() =
        runTest {
            val before = answered()
            coEvery { api.listAiTasks(limit = 100) } returns list(before)
            repository.refresh()
            val after = answered(messages = listOf(TestFixtures.threadMessage("u1", role = "user")), correctionState = "queued")
            coEvery { api.replyToAiTask("1", "It was 3 eggs", "key-1") } returns AiTaskReplyResult(after, replayed = false)

            val result = repository.reply("1", "It was 3 eggs", "key-1")

            assertEquals(after, result)
            assertEquals(listOf(after), repository.tasks.value)
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun aListReadThatStartedBeforeAReplyLandedIsDropped() =
        runTest {
            val before = answered()
            coEvery { api.listAiTasks(limit = 100) } returns list(before)
            repository.refresh()
            val staleRead = CompletableDeferred<AiTasksResponse>()
            coEvery { api.listAiTasks(limit = 100) } coAnswers { staleRead.await() }
            val after = answered(messages = listOf(TestFixtures.threadMessage("u1", role = "user")), correctionState = "queued")
            coEvery { api.replyToAiTask("1", "x", "key-1") } returns AiTaskReplyResult(after, replayed = false)

            val inFlight = launch { repository.refresh() }
            runCurrent()
            repository.reply("1", "x", "key-1")
            staleRead.complete(list(before))
            inFlight.join()

            assertEquals(listOf(after), repository.tasks.value)
        }

    @Test
    fun aReplayedReplyReReadsTheListInsteadOfApplyingItsOldBody() =
        runTest {
            val snapshot = answered(messages = listOf(TestFixtures.threadMessage("u1", role = "user")), correctionState = "queued")
            val current =
                answered(
                    messages = listOf(TestFixtures.threadMessage("u1", role = "user"), TestFixtures.threadMessage("a1", unread = true)),
                )
            coEvery { api.replyToAiTask("1", "x", "key-1") } returns AiTaskReplyResult(snapshot, replayed = true)
            coEvery { api.listAiTasks(limit = 100) } returns list(current)

            val result = repository.reply("1", "x", "key-1")

            assertEquals(snapshot, result)
            assertEquals(listOf(current), repository.tasks.value)
        }

    @Test
    fun aFailedReReadAfterAReplayKeepsTheFresherCopyAndFailsTheSend() =
        runTest {
            val reporter: ErrorReporter = mockk(relaxed = true)
            val repo = AiTaskRepository(api, reporter, appModeManager())
            val fresher =
                answered(
                    messages = listOf(TestFixtures.threadMessage("u1", role = "user"), TestFixtures.threadMessage("a1", unread = true)),
                )
            coEvery { api.listAiTasks(limit = 100) } returns list(fresher)
            repo.refresh()
            coEvery { api.replyToAiTask("1", "x", "key-1") } returns
                AiTaskReplyResult(answered(correctionState = "queued"), replayed = true)
            coEvery { api.listAiTasks(limit = 100) } throws java.io.IOException("offline")

            assertFailsWith<java.io.IOException> { repo.reply("1", "x", "key-1") }

            assertEquals(listOf(fresher), repo.tasks.value)
            verify(exactly = 0) { reporter.captureException(any()) }
        }

    @Test
    fun aRejectedReplyReReadsTheListAndRethrows() =
        runTest {
            for ((status, code) in listOf(403 to "budget_exhausted", 404 to "task_not_found", 409 to "correction_in_flight")) {
                coEvery { api.replyToAiTask("1", "x", "key-1") } throws rejection(status, code)
                coEvery { api.listAiTasks(limit = 100) } returns list(answered(correctionState = "running"))

                val error = assertFailsWith<ApiException> { repository.reply("1", "x", "key-1") }

                assertEquals(status, error.statusCode)
                assertEquals(
                    "running",
                    repository.tasks.value
                        .single()
                        .claudeThread
                        ?.correctionState,
                )
            }
            coVerify(exactly = 3) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun aCodedRateLimitReReadsTheListButTheGenericLimiterDoesNot() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } returns list(answered())
            coEvery { api.replyToAiTask("1", "x", "a") } throws rejection(429, "failed_too_often")
            coEvery { api.replyToAiTask("1", "x", "b") } throws rejection(429, null)
            coEvery { api.replyToAiTask("1", "x", "c") } throws ApiException("boom", 500)

            assertFailsWith<ApiException> { repository.reply("1", "x", "a") }
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
            assertFailsWith<ApiException> { repository.reply("1", "x", "b") }
            assertFailsWith<ApiException> { repository.reply("1", "x", "c") }
            coVerify(exactly = 1) { api.listAiTasks(limit = 100) }
        }

    @Test
    fun aRejectionStillThrowsWhenTheReReadFailsToo() =
        runTest {
            coEvery { api.replyToAiTask("1", "x", "key-1") } throws rejection(409, "reply_limit_reached")
            coEvery { api.listAiTasks(limit = 100) } throws RuntimeException("offline")

            val error = assertFailsWith<ApiException> { repository.reply("1", "x", "key-1") }

            assertEquals(409, error.statusCode)
            assertEquals("offline", error.suppressed.single().message)
        }

    @Test
    fun refreshAnnouncesUnreadAnswers() =
        runTest {
            val announced = mutableListOf<List<String>>()
            repository.onUnreadReplies = { unread -> announced += unread.map { it.message.id } }
            coEvery { api.listAiTasks(limit = 100) } returns
                list(
                    answered(
                        "1",
                        messages =
                            listOf(
                                TestFixtures.threadMessage("u1", role = "user"),
                                TestFixtures.threadMessage("a1", unread = true),
                                TestFixtures.threadMessage("a2"),
                            ),
                    ),
                    answered("2"),
                )

            repository.refresh()

            assertEquals(listOf(listOf("a1")), announced)
            assertEquals(1, repository.unreadReplyCount())
        }

    @Test
    fun refreshWithoutUnreadAnswersAnnouncesNothing() =
        runTest {
            var calls = 0
            repository.onUnreadReplies = { calls++ }
            coEvery { api.listAiTasks(limit = 100) } returns list(answered(messages = listOf(TestFixtures.threadMessage("a1"))))

            repository.refresh()

            assertEquals(0, calls)
            assertEquals(0, repository.unreadReplyCount())
        }

    @Test
    fun anAnswerThatChangedTheDiaryIsHandedOnWithItsTask() =
        runTest {
            val handed = mutableListOf<List<Pair<String, String>>>()
            repository.onChangedReplies = { changed -> handed += changed.map { it.message.id to it.task.date } }
            val user = TestFixtures.threadMessage("u1", role = "user")
            coEvery { api.listAiTasks(limit = 100) } returns list(answered(messages = listOf(user), correctionState = "running"))
            repository.refresh()
            val changed = TestFixtures.threadMessage("a1", outcome = "changed")
            coEvery { api.listAiTasks(limit = 100) } returns list(answered(date = "2024-01-15", messages = listOf(user, changed)))

            repository.refresh()
            repository.refresh()

            assertEquals(listOf(listOf("a1" to "2024-01-15")), handed)
        }

    @Test
    fun theFirstReadHandsOnUnreadChanges() =
        runTest {
            val handed = mutableListOf<List<String>>()
            repository.onChangedReplies = { changed -> handed += changed.map { it.message.id } }
            coEvery { api.listAiTasks(limit = 100) } returns
                list(answered(date = "2024-01-20", messages = listOf(TestFixtures.threadMessage("a1", outcome = "changed", unread = true))))

            repository.refresh()

            assertEquals(listOf(listOf("a1")), handed)
        }

    @Test
    fun aFailedDiaryRefreshIsReportedWithoutFailingTheListRead() =
        runTest {
            val reporter: ErrorReporter = mockk(relaxed = true)
            val repo = AiTaskRepository(api, reporter, appModeManager())
            repo.onChangedReplies = { throw RuntimeException("entries offline") }
            val task = answered(messages = listOf(TestFixtures.threadMessage("a1", outcome = "changed", unread = true)))
            coEvery { api.listAiTasks(limit = 100) } returns list(task)

            repo.refresh()

            assertEquals(listOf(task), repo.tasks.value)
            verify(exactly = 1) { reporter.captureException(match { it.message == "entries offline" }) }
        }

    @Test
    fun markingRepliesReadNamesOnlyUnreadAnswersAndClearsThemLocally() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } returns
                list(
                    answered(
                        messages =
                            listOf(
                                TestFixtures.threadMessage("u1", role = "user"),
                                TestFixtures.threadMessage("a1", unread = true),
                                TestFixtures.threadMessage("a2", unread = false),
                                TestFixtures.threadMessage("a3", unread = true),
                            ),
                    ),
                )
            repository.refresh()
            coEvery { api.acknowledgeAiTaskReplies(any()) } returns 1

            assertTrue(repository.markRepliesRead(listOf("a1", "a2", "u1", "missing", "a1")))

            coVerify(exactly = 1) { api.acknowledgeAiTaskReplies(listOf("a1")) }
            coVerify(exactly = 0) { api.acknowledgeAiTasks(any()) }
            assertEquals(
                listOf("a3"),
                repository.tasks.value
                    .single()
                    .unreadReplies()
                    .map { it.id },
            )
            assertEquals(
                1,
                repository.tasks.value
                    .single()
                    .claudeThread
                    ?.unreadReplies,
            )

            assertTrue(repository.markRepliesRead(listOf("a1")))

            coVerify(exactly = 1) { api.acknowledgeAiTaskReplies(any()) }
        }

    @Test
    fun anAnswerAlreadyMarkedReadIsNotSentAgainAfterAStaleRead() =
        runTest {
            val unread = list(answered(messages = listOf(TestFixtures.threadMessage("a1", unread = true))))
            coEvery { api.listAiTasks(limit = 100) } returns unread
            repository.refresh()
            coEvery { api.acknowledgeAiTaskReplies(any()) } returns 1
            repository.markRepliesRead(listOf("a1"))

            repository.refresh()
            repository.markRepliesRead(listOf("a1"))

            coVerify(exactly = 1) { api.acknowledgeAiTaskReplies(any()) }
        }

    @Test
    fun moreThanAHundredAnswersAreMarkedReadInSeveralRequests() =
        runTest {
            val messages = (1..150).map { TestFixtures.threadMessage("a$it", unread = true) }
            coEvery { api.listAiTasks(limit = 100) } returns list(answered(messages = messages))
            repository.refresh()
            val sent = mutableListOf<List<String>>()
            coEvery { api.acknowledgeAiTaskReplies(capture(sent)) } returns 1

            repository.markRepliesRead(messages.map { it.id })

            assertEquals(listOf(100, 50), sent.map { it.size })
            assertEquals(0, repository.unreadReplyCount())
        }

    @Test
    fun aFailedReadMarkIsReportedAndLeavesTheAnswersUnread() =
        runTest {
            val reporter: ErrorReporter = mockk(relaxed = true)
            val repo = AiTaskRepository(api, reporter, appModeManager())
            coEvery { api.listAiTasks(limit = 100) } returns
                list(answered(messages = listOf(TestFixtures.threadMessage("a1", unread = true))))
            repo.refresh()
            coEvery { api.acknowledgeAiTaskReplies(any()) } throws java.io.IOException("offline")

            assertFalse(repo.markRepliesRead(listOf("a1")))
            assertFalse(repo.markRepliesRead(listOf("a1"), quiet = true))

            assertEquals(1, repo.unreadReplyCount())
            verify(exactly = 1) { reporter.captureException(any()) }
            coEvery { api.acknowledgeAiTaskReplies(any()) } returns 1
            assertTrue(repo.markRepliesRead(listOf("a1")))
            assertEquals(0, repo.unreadReplyCount())
        }

    @Test
    fun markingRepliesReadDoesNothingInLocalMode() =
        runTest {
            val local = AiTaskRepository(api, NoopErrorReporter(), appModeManager(AppMode.LOCAL))

            local.markRepliesRead(listOf("a1"))

            coVerify(exactly = 0) { api.acknowledgeAiTaskReplies(any()) }
        }

    @Test
    fun acknowledgingDismissalsStillAcknowledgesEveryTaskAndNamesNoReplies() =
        runTest {
            val dismissed = TestFixtures.aiTask(id = "d1", status = AiTask.Status.dismissed)
            val withAnswer = answered("2", messages = listOf(TestFixtures.threadMessage("a1", unread = true)))
            coEvery { api.listAiTasks(limit = 100) } returns list(dismissed, withAnswer)
            repository.refresh()
            coEvery { api.acknowledgeAiTasks() } returns 1

            repository.acknowledgeAll()

            coVerify(exactly = 1) { api.acknowledgeAiTasks(null) }
            coVerify(exactly = 0) { api.acknowledgeAiTaskReplies(any()) }
        }

    @Test
    fun unreadAnswersAloneDoNotTriggerTheDismissalAcknowledgement() =
        runTest {
            coEvery { api.listAiTasks(limit = 100) } returns
                list(answered(messages = listOf(TestFixtures.threadMessage("a1", unread = true))))
            repository.refresh()

            repository.acknowledgeAll()

            coVerify(exactly = 0) { api.acknowledgeAiTasks(any()) }
        }
}
