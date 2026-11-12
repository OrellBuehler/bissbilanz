package com.bissbilanz.util

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeProcessing
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.TestFixtures.claudeThread
import com.bissbilanz.test.TestFixtures.threadMessage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AiTaskThreadsTest {
    private fun completed(
        id: String = "t1",
        date: String = "2024-01-15",
        thread: AiTaskClaudeThread? = null,
    ) = TestFixtures.aiTask(
        id = id,
        status = AiTask.Status.completed,
        date = date,
        processedByKind = "claude",
        claudeThread = thread,
    )

    @Test
    fun everyKnownCorrectionStateIsRecognised() {
        assertEquals(CorrectionState.IDLE, claudeThread(correctionState = "idle").correction())
        assertEquals(CorrectionState.QUEUED, claudeThread(correctionState = "queued").correction())
        assertEquals(CorrectionState.RUNNING, claudeThread(correctionState = "running").correction())
        assertEquals(CorrectionState.RETRYING, claudeThread(correctionState = "retrying").correction())
        assertEquals(CorrectionState.FAILED, claudeThread(correctionState = "failed").correction())
    }

    @Test
    fun anUnknownCorrectionStateShowsAsInProgressButIsNotPolled() {
        val state = claudeThread(correctionState = "thinking_hard").correction()

        assertEquals(CorrectionState.UNKNOWN, state)
        assertTrue(state.isInProgress())
        assertFalse(state.isPolled())
    }

    @Test
    fun idleAndFailedAreSettled() {
        assertFalse(CorrectionState.IDLE.isInProgress())
        assertFalse(CorrectionState.FAILED.isInProgress())
        assertTrue(CorrectionState.QUEUED.isInProgress())
        assertTrue(CorrectionState.RUNNING.isPolled())
        assertTrue(CorrectionState.RETRYING.isPolled())
        assertFalse(CorrectionState.FAILED.isPolled())
    }

    @Test
    fun anUnknownRoleIsShownLikeTheAssistant() {
        assertEquals(ReplyAuthor.USER, threadMessage("m1", role = "user").author())
        assertEquals(ReplyAuthor.ASSISTANT, threadMessage("m2", role = "assistant").author())
        assertEquals(ReplyAuthor.ASSISTANT, threadMessage("m3", role = "system_notice").author())
    }

    @Test
    fun anUnknownOutcomeReadsLikeAnswered() {
        assertEquals(ReplyOutcome.CHANGED, threadMessage("m1", outcome = "changed").replyOutcome())
        assertEquals(ReplyOutcome.FAILED, threadMessage("m2", outcome = "failed").replyOutcome())
        assertEquals(ReplyOutcome.ANSWERED, threadMessage("m3", outcome = "answered").replyOutcome())
        assertEquals(ReplyOutcome.ANSWERED, threadMessage("m4", outcome = "partially_changed").replyOutcome())
        assertEquals(ReplyOutcome.ANSWERED, threadMessage("m5", outcome = null).replyOutcome())
        assertNull(threadMessage("m6", role = "user", outcome = "changed").replyOutcome())
    }

    @Test
    fun blockedReasonsMapToTheirBlockAndUnknownOnesToOther() {
        val expected =
            mapOf(
                "not_processed_by_server" to ReplyBlock.NOT_PROCESSED_BY_SERVER,
                "not_completed" to ReplyBlock.NOT_COMPLETED,
                "correction_in_flight" to ReplyBlock.CORRECTION_IN_FLIGHT,
                "reply_limit_reached" to ReplyBlock.REPLY_LIMIT_REACHED,
                "failed_too_often" to ReplyBlock.FAILED_TOO_OFTEN,
                "processor_unavailable" to ReplyBlock.PROCESSOR_UNAVAILABLE,
                "budget_exhausted" to ReplyBlock.BUDGET_EXHAUSTED,
                "rate_limited" to ReplyBlock.RATE_LIMITED,
                "moon_phase" to ReplyBlock.OTHER,
            )
        expected.forEach { (code, block) -> assertEquals(block, ReplyBlock.of(code), code) }
        assertEquals(ReplyBlock.OTHER, ReplyBlock.of(null))
    }

    @Test
    fun aThreadThatTakesRepliesHasNoBlock() {
        assertNull(claudeThread(canReply = true).replyBlock())
        assertEquals(
            ReplyBlock.REPLY_LIMIT_REACHED,
            claudeThread(canReply = false, replyBlockedReason = "reply_limit_reached").replyBlock(),
        )
        assertEquals(ReplyBlock.OTHER, claudeThread(canReply = false, replyBlockedReason = null).replyBlock())
    }

    @Test
    fun unreadRepliesAreTheAssistantsUnreadMessagesOnly() {
        val task =
            completed(
                thread =
                    claudeThread(
                        threadMessage("u1", role = "user"),
                        threadMessage("a1", unread = false),
                        threadMessage("a2", unread = true),
                        threadMessage("a3", role = "future_role", unread = true),
                    ),
            )

        assertEquals(listOf("a2", "a3"), task.unreadReplies().map { it.id })
        assertTrue(task.hasUnreadReply())
        assertFalse(completed().hasUnreadReply())
    }

    @Test
    fun markingRepliesReadClearsOnlyThoseAndRecountsTheThread() {
        val task =
            completed(thread = claudeThread(threadMessage("a1", unread = true), threadMessage("a2", unread = true)))

        val read = task.withRepliesRead(setOf("a1"))

        assertEquals(listOf(false, true), read.claudeThread?.messages?.map { it.unread })
        assertEquals(1, read.claudeThread?.unreadReplies)
        assertSame(task, task.withRepliesRead(setOf("other")))
        val withoutThread = completed()
        assertSame(withoutThread, withoutThread.withRepliesRead(setOf("a1")))
    }

    @Test
    fun activeWorkCoversPendingRunsAndPolledCorrections() {
        val pendingRun =
            TestFixtures.aiTask(claudeProcessing = AiTaskClaudeProcessing(state = "running", proposal = null))
        val blockedRun =
            TestFixtures.aiTask(claudeProcessing = AiTaskClaudeProcessing(state = "blocked", proposal = null))

        assertTrue(listOf(pendingRun).hasActiveClaudeWork())
        assertFalse(listOf(blockedRun).hasActiveClaudeWork())
        assertTrue(listOf(completed(thread = claudeThread(correctionState = "queued"))).hasActiveClaudeWork())
        assertTrue(listOf(completed(thread = claudeThread(correctionState = "retrying"))).hasActiveClaudeWork())
        assertFalse(listOf(completed(thread = claudeThread(correctionState = "failed"))).hasActiveClaudeWork())
        assertFalse(listOf(completed(thread = claudeThread(correctionState = "new_state"))).hasActiveClaudeWork())
        assertFalse(listOf(completed()).hasActiveClaudeWork())
    }

    @Test
    fun onTheFirstReadOnlyUnreadChangesAreCandidates() {
        val next =
            listOf(
                completed("t1", "2024-01-15", claudeThread(threadMessage("a1", outcome = "changed", unread = true))),
                completed("t2", "2024-01-16", claudeThread(threadMessage("a2", outcome = "changed", unread = false))),
                completed("t3", "2024-01-17", claudeThread(threadMessage("a3", outcome = "answered", unread = true))),
            )

        val changed = changedReplies(null, next)

        assertEquals(listOf("a1"), changed.map { it.message.id })
        assertEquals(listOf("2024-01-15"), changed.map { it.task.date })
    }

    @Test
    fun laterReadsAddChangesTheyHadNotSeenAndStillUnreadOnes() {
        val seen = threadMessage("a1", outcome = "changed")
        val seenUnread = threadMessage("a5", outcome = "changed", unread = true)
        val previous = listOf(completed("t1", "2024-01-15", claudeThread(seen, seenUnread)))
        val next =
            listOf(
                completed("t1", "2024-01-15", claudeThread(seen, seenUnread)),
                completed("t2", "2024-01-16", claudeThread(threadMessage("a2", outcome = "changed"))),
                completed("t3", "2024-01-17", claudeThread(threadMessage("a3", outcome = "failed"))),
                completed("t4", "2024-01-18", claudeThread(threadMessage("u4", role = "user"))),
            )

        assertEquals(listOf("a5", "a2"), changedReplies(previous, next).map { it.message.id })
        assertEquals(listOf("a5"), changedReplies(next, next).map { it.message.id })
    }

    @Test
    fun unreadTaskRepliesPairTheAnswerWithItsTask() {
        val task = completed(thread = claudeThread(threadMessage("u1", role = "user"), threadMessage("a1", unread = true)))

        assertEquals(listOf(TaskReply(task, task.claudeThread!!.messages[1])), task.unreadTaskReplies())
        assertEquals(listOf("u1", "a1"), task.threadMessageIds())
    }
}
