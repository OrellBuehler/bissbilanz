package com.bissbilanz.android.ui.components

import com.bissbilanz.android.chat.OutgoingChatMessage
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.message
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.run
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.text
import com.bissbilanz.api.generated.model.ChatMessageContext
import com.bissbilanz.chat.ChatRunEnd
import com.bissbilanz.chat.ChatSendProblem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class ChatMessagesTest {
    private fun outgoing(id: String) =
        OutgoingChatMessage(
            id = id,
            conversationId = "c1",
            text = "Hi",
            photos = emptyList(),
            context = ChatMessageContext(),
            createsConversation = false,
        )

    @Test
    fun rowsAreNewestFirstAndAnAcceptedMessageShowsOnce() {
        val user = message("u1", "c1", "user", listOf(text("Hi")))
        val answer = message("a1", "c1", "assistant", listOf(text("Hello")))

        val rows = chatRows(listOf(user, answer), listOf(outgoing("u1"), outgoing("u2")), activeRun = null)

        assertEquals(listOf("o-u2", "m-a1", "m-u1"), rows.map { it.key })
    }

    @Test
    fun aWorkingRunWithoutItsAnswerYetShowsThatItIsThinking() {
        val user = message("u1", "c1", "user", listOf(text("Hi")))

        val waiting = chatRows(listOf(user), emptyList(), run("queued", "c1"))
        val answering =
            chatRows(
                listOf(user, message("a1", "c1", "assistant", emptyList(), status = "in_progress")),
                emptyList(),
                run("running", "c1"),
            )

        assertEquals(ChatRow.Waiting, waiting.first())
        assertTrue(ChatRow.Waiting !in answering)
    }

    @Test
    fun anEmptyChatShowsTheIntro() {
        assertEquals(listOf(ChatRow.Intro), chatRows(emptyList(), emptyList(), null))
    }

    @Test
    fun aCardExpiresAtItsTime() {
        val now = Instant.parse("2026-11-19T21:00:00Z")

        assertTrue(isExpired("2026-11-19T20:59:59Z", now))
        assertFalse(isExpired("2026-11-19T21:56:15.139Z", now))
        assertFalse(isExpired(null, now))
        assertFalse(isExpired("soon", now))
        assertFalse(isExpired("", now))
    }

    @Test
    fun aQuestionWhoseRunEndedWithoutAnAnswerCarriesHowItEnded() {
        val question = message("u1", "c1", "user", listOf(text("Hi")))
        val end = ChatRunEnd("cancelled", "user_cancelled")

        val rows = chatRows(listOf(question), emptyList(), null, mapOf(ChatTestFixtures.RUN to end))

        assertEquals(ChatRow.Message(question, end), rows.single())
    }

    @Test
    fun onlyProblemsARetryCanFixOfferIt() {
        assertTrue(ChatSendProblem.NETWORK.retryable())
        assertTrue(ChatSendProblem.DAILY_LIMIT.retryable())
        assertFalse(ChatSendProblem.CONVERSATION_TOO_LONG.retryable())
        assertFalse(ChatSendProblem.INVALID_IMAGE.retryable())
    }
}
