package com.bissbilanz.chat

import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.chat.ChatFixtures.ASSISTANT_MESSAGE
import com.bissbilanz.chat.ChatFixtures.CONVERSATION
import com.bissbilanz.chat.ChatFixtures.action
import com.bissbilanz.chat.ChatFixtures.assistantMessage
import com.bissbilanz.chat.ChatFixtures.detail
import com.bissbilanz.chat.ChatFixtures.event
import com.bissbilanz.chat.ChatFixtures.run
import com.bissbilanz.chat.ChatFixtures.userMessage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame

class ChatFolderTest {
    private val entries = listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18")))

    /** The example run of `docs/ai-chat.md` §9: a log, a confirmation, its approval and the reply. */
    private val confirmedRun =
        listOf(
            event(1, ChatEventType.MESSAGE_CREATED, message = userMessage()),
            event(2, ChatEventType.RUN_STARTED, run = run()),
            event(3, ChatEventType.TEXT_DELTA, partIndex = 0, text = "Let me "),
            event(4, ChatEventType.TEXT_DELTA, partIndex = 0, text = "log that."),
            event(5, ChatEventType.TOOL_STARTED, partIndex = 1, name = "log_food", label = "Logging food", toolUseId = "toolu_1"),
            event(6, ChatEventType.TOOL_FINISHED, partIndex = 1, status = ChatStatus.TOOL_OK, changes = entries, toolUseId = "toolu_1"),
            event(7, ChatEventType.ACTION_REQUIRED, partIndex = 2, action = action()),
        )

    private val approvedAndFinished =
        listOf(
            event(8, ChatEventType.ACTION_RESOLVED, partIndex = 2, actionId = "a1", status = ChatStatus.ACTION_APPROVED),
            event(9, ChatEventType.RUN_RESUMED, run = run()),
            event(10, ChatEventType.TOOL_STARTED, partIndex = 3, name = "delete_entry", label = "Deleting an entry"),
            event(11, ChatEventType.TOOL_FINISHED, partIndex = 3, status = ChatStatus.TOOL_OK, changes = entries),
            event(12, ChatEventType.TEXT_DELTA, partIndex = 4, text = "Done."),
            event(13, ChatEventType.RUN_FINISHED, status = ChatStatus.COMPLETED, run = run(ChatStatus.COMPLETED), changes = entries),
        )

    private fun fold(
        events: List<ChatEvent>,
        start: ChatThread = ChatThread(CONVERSATION),
    ) = events.fold(start, ChatFolder::apply)

    @Test
    fun textDeltasAppendToTheirPart() {
        val thread = fold(confirmedRun.take(4))

        val assistant = thread.messages.last()
        assertEquals(ASSISTANT_MESSAGE, assistant.id)
        assertEquals(ChatStatus.IN_PROGRESS, assistant.status)
        assertEquals("Let me log that.", assistant.parts.single().text)
        assertEquals(4, thread.lastSeq)
    }

    @Test
    fun aReplayAfterAReconnectDoesNotAppendTextTwice() {
        val once = fold(confirmedRun)

        val replayed = fold(confirmedRun, start = once)

        assertEquals(once, replayed)
        assertEquals(
            "Let me log that.",
            replayed.messages
                .last()
                .parts[0]
                .text,
        )
    }

    @Test
    fun aDuplicateDeltaInsideTheStreamIsIgnored() {
        val thread = fold(confirmedRun.take(3) + confirmedRun[2] + confirmedRun[3])

        assertEquals(
            "Let me log that.",
            thread.messages
                .last()
                .parts[0]
                .text,
        )
    }

    @Test
    fun toolPartsGoFromRunningToTheirResult() {
        val running = fold(confirmedRun.take(5))
        assertEquals(
            ChatStatus.TOOL_RUNNING,
            running.messages
                .last()
                .parts[1]
                .status,
        )
        assertEquals(
            "Logging food",
            running.messages
                .last()
                .parts[1]
                .label,
        )

        val finished = fold(confirmedRun.take(6))
        val tool = finished.messages.last().parts[1]
        assertEquals(ChatStatus.TOOL_OK, tool.status)
        assertEquals("Logging food", tool.label)
        assertEquals(entries, tool.changes)
    }

    @Test
    fun aConfirmationPausesTheRunAndItsDecisionShowsOnTheCard() {
        val paused = fold(confirmedRun)
        val card = paused.messages.last().parts[2]
        assertEquals(ChatPartType.ACTION, card.type)
        assertEquals("a1", card.actionId)
        assertEquals(ChatStatus.ACTION_PENDING, card.status)
        assertEquals(listOf("2 servings · 120 kcal"), card.preview?.details)
        assertEquals(ChatStatus.AWAITING_CONFIRMATION, paused.activeRun?.status)

        val resumed = fold(approvedAndFinished.take(2), start = paused)
        assertEquals(
            ChatStatus.ACTION_APPROVED,
            resumed.messages
                .last()
                .parts[2]
                .status,
        )
        assertEquals(ChatStatus.RUNNING, resumed.activeRun?.status)
    }

    @Test
    fun runFinishedEndsTheRunAndSettlesAMessageWhoseCompletionWasMissed() {
        val finished = fold(confirmedRun + approvedAndFinished)

        assertNull(finished.activeRun)
        assertEquals(ChatStatus.COMPLETED, finished.messages.last().status)
        assertEquals(
            listOf("Let me log that.", null, null, null, "Done."),
            finished.messages
                .last()
                .parts
                .map { it.text },
        )
        assertEquals(13, finished.lastSeq)
    }

    @Test
    fun messageCompletedReplacesWhateverWasAccumulated() {
        val final = assistantMessage(listOf(ChatMessagePart(type = ChatPartType.TEXT, text = "The full answer.")))

        val thread = fold(confirmedRun.take(4) + event(5, ChatEventType.MESSAGE_COMPLETED, message = final))

        assertEquals(final, thread.messages.last())
        assertEquals(2, thread.messages.size)
    }

    @Test
    fun anUnknownEventTypeIsSteppedPastWithoutChangingAnything() {
        val before = fold(confirmedRun.take(4))

        val after = ChatFolder.apply(before, event(5, "something_new", partIndex = 0, text = "ignored"))

        assertEquals(before.messages, after.messages)
        assertEquals(5, after.lastSeq)
    }

    @Test
    fun anEventThatDidNotDecodeIsSteppedPastByItsSeq() {
        val before = fold(confirmedRun.take(2))

        assertEquals(3, ChatFolder.skip(before, 3).lastSeq)
        assertSame(before, ChatFolder.skip(before, 2))
        assertSame(before, ChatFolder.skip(before, null))
    }

    @Test
    fun theFinishOfASupersededRunDoesNotEndTheNewOne() {
        val next = run(id = "r2")
        val thread = ChatThread(CONVERSATION, activeRun = next, lastSeq = 4)

        val after = ChatFolder.apply(thread, event(5, ChatEventType.RUN_FINISHED, status = ChatStatus.CANCELLED, reason = "superseded"))

        assertEquals(next, after.activeRun)
    }

    @Test
    fun aDeltaForAMessageNotSeenYetCreatesItAndKeepsThePartIndex() {
        val thread =
            ChatFolder.apply(
                ChatThread(CONVERSATION, lastSeq = 7),
                event(8, ChatEventType.TEXT_DELTA, partIndex = 2, text = "late"),
            )

        val parts = thread.messages.single().parts
        assertEquals(listOf(ChatPartType.GAP, ChatPartType.GAP, ChatPartType.TEXT), parts.map { it.type })
        assertEquals("late", parts[2].text)
    }

    @Test
    fun aSeededConversationContinuesAfterItsLastSeq() {
        val inProgress =
            assistantMessage(listOf(ChatMessagePart(type = ChatPartType.TEXT, text = "Let me ")), status = ChatStatus.IN_PROGRESS)
        val seeded = ChatFolder.seed(detail(listOf(userMessage(), inProgress), lastSeq = 3, activeRun = run()))

        val thread = fold(confirmedRun, start = seeded)

        assertEquals(
            "Let me log that.",
            thread.messages
                .last()
                .parts[0]
                .text,
        )
        assertEquals(ChatStatus.AWAITING_CONFIRMATION, thread.activeRun?.status)
    }

    @Test
    fun aReloadOlderThanWhatWasFoldedIsNotApplied() {
        val current = fold(confirmedRun)

        assertSame(current, ChatFolder.reseed(current, detail(emptyList(), lastSeq = 3)))
        assertEquals(9, ChatFolder.reseed(current, detail(emptyList(), lastSeq = 9)).lastSeq)
    }

    @Test
    fun aSeedDropsAFinalRun() {
        assertNull(ChatFolder.seed(detail(emptyList(), lastSeq = 1, activeRun = run(ChatStatus.COMPLETED))).activeRun)
    }

    @Test
    fun anActionFromAConflictReplacesItsCard() {
        val paused = fold(confirmedRun)

        val updated = ChatFolder.withAction(paused, action(ChatStatus.ACTION_EXPIRED))

        assertEquals(
            ChatStatus.ACTION_EXPIRED,
            updated.messages
                .last()
                .parts[2]
                .status,
        )
    }

    @Test
    fun aResponseRunStartsOrEndsFollowing() {
        val idle = ChatThread(CONVERSATION)

        val queued = ChatFolder.withRun(idle, run(ChatStatus.QUEUED))
        assertEquals(ChatStatus.QUEUED, queued.activeRun?.status)
        assertNull(ChatFolder.withRun(queued, run(ChatStatus.CANCELLED)).activeRun)
        assertEquals(queued.activeRun, ChatFolder.withRun(queued, run(ChatStatus.CANCELLED, id = "other")).activeRun)
    }

    @Test
    fun aLateResponseDoesNotRestartARunThatAlreadyEnded() {
        val finished = fold(confirmedRun + approvedAndFinished)

        assertNull(ChatFolder.withRun(finished, run(ChatStatus.QUEUED)).activeRun)
        assertNull(ChatFolder.polled(finished, run(ChatStatus.RUNNING)).activeRun)
        assertEquals(ChatStatus.QUEUED, ChatFolder.withRun(finished, run(ChatStatus.QUEUED, id = "r2")).activeRun?.status)
    }

    @Test
    fun aQueuedRunFromALateResponseDoesNotSetARunningRunBack() {
        val running = fold(confirmedRun.take(2))
        assertEquals(ChatStatus.RUNNING, running.activeRun?.status)

        assertEquals(ChatStatus.RUNNING, ChatFolder.withRun(running, run(ChatStatus.QUEUED)).activeRun?.status)
        val paused = fold(confirmedRun)
        assertEquals(ChatStatus.QUEUED, ChatFolder.withRun(paused, run(ChatStatus.QUEUED)).activeRun?.status)
    }

    @Test
    fun aPollWithoutAnActiveRunDoesNotEndTheRunItsEventsHaveNotEnded() {
        val running = fold(confirmedRun.take(4))

        assertEquals(running, ChatFolder.polled(running, null))
        assertEquals(
            ChatStatus.AWAITING_CONFIRMATION,
            ChatFolder.polled(running, run(ChatStatus.AWAITING_CONFIRMATION)).activeRun?.status,
        )
    }

    @Test
    fun anAcceptedSendKeepsOlderReloadsFromDroppingIt() {
        val sent = userMessage(id = "m-new")
        val thread =
            ChatFolder.accept(
                ChatThread(CONVERSATION, lastSeq = 4),
                ChatMessageAcceptedResponse(message = sent, run = run(ChatStatus.QUEUED, id = "r2"), seq = 5),
            )

        assertEquals(5, thread.seqFloor)
        assertEquals(4, thread.lastSeq)
        assertEquals("r2", thread.activeRun?.id)
        assertSame(thread, ChatFolder.reseed(thread, detail(emptyList(), lastSeq = 4)))
        assertEquals(5, ChatFolder.reseed(thread, detail(listOf(sent), lastSeq = 5)).seqFloor)
    }

    @Test
    fun aRunThatEndsWithoutAnAnswerIsRememberedForItsQuestion() {
        val queued =
            fold(
                listOf(event(1, ChatEventType.MESSAGE_CREATED, message = userMessage())),
                ChatThread(CONVERSATION, activeRun = run(ChatStatus.QUEUED)),
            )

        val failing = ChatFolder.apply(queued, event(2, ChatEventType.ERROR, code = "user_budget_exhausted").copy(messageId = null))
        assertEquals(ChatRunEnd(ChatStatus.FAILED, "user_budget_exhausted"), failing.unansweredRuns[ChatFixtures.RUN])

        val cancelled =
            ChatFolder.apply(
                failing,
                event(3, ChatEventType.RUN_FINISHED, status = ChatStatus.CANCELLED, reason = "user_cancelled").copy(messageId = null),
            )
        assertEquals(ChatRunEnd(ChatStatus.CANCELLED, "user_cancelled"), cancelled.unansweredRuns[ChatFixtures.RUN])
        assertNull(cancelled.activeRun)
    }

    @Test
    fun anAnsweredRunIsNotUnanswered() {
        val answered = fold(confirmedRun.take(3) + event(4, ChatEventType.ERROR, code = "api_error"))

        assertEquals(emptyMap(), answered.unansweredRuns)
    }
}
