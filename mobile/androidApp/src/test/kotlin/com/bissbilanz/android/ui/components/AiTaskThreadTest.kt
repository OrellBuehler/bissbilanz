package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.ReplyDraft
import com.bissbilanz.android.ui.viewmodels.ReplyFailure
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskThreadTest.TestApp::class)
class AiTaskThreadTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun message(
        id: String,
        text: String,
        role: String = "assistant",
        outcome: String? = if (role == "user") null else "answered",
        unread: Boolean = false,
    ) = AiTaskThreadMessage(id, role, text, outcome, "2026-10-12T10:00:00Z", unread)

    private fun thread(
        vararg messages: AiTaskThreadMessage,
        correctionState: String = "idle",
        canReply: Boolean = true,
        replyBlockedReason: String? = null,
    ) = AiTaskClaudeThread(messages.toList(), correctionState, canReply, replyBlockedReason, 4, messages.count { it.unread })

    private fun show(
        thread: AiTaskClaudeThread,
        draft: ReplyDraft = ReplyDraft(),
        newReplyIds: Set<String> = emptySet(),
        onTextChange: (String) -> Unit = {},
        onSend: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskThread(
                    thread = thread,
                    draft = draft,
                    newReplyIds = newReplyIds,
                    onTextChange = onTextChange,
                    onSend = onSend,
                )
            }
        }
    }

    @Test
    fun theThreadShowsWhoWroteWhatAndWhatEachAnswerDid() {
        show(
            thread(
                message("u1", "It was 3 eggs", role = "user"),
                message("a1", "Changed to 3 eggs.", outcome = "changed"),
                message("u2", "And the toast?", role = "user"),
                message("a2", "Could not find the toast.", outcome = "failed"),
                message("a3", "The toast is already logged.", outcome = "some_future_outcome"),
            ),
        )

        composeTestRule.onAllNodesWithText("You").assertCountEqualsTo(2)
        composeTestRule.onAllNodesWithText("Claude").assertCountEqualsTo(3)
        composeTestRule.onNodeWithText("Changes applied").assertIsDisplayed()
        composeTestRule.onNodeWithText("Did not work").assertIsDisplayed()
        composeTestRule.onNodeWithText("The toast is already logged.").assertIsDisplayed()
    }

    @Test
    fun unreadAndJustReadAnswersAreMarkedNew() {
        show(
            thread(message("a1", "First", unread = true), message("a2", "Second"), message("a3", "Third")),
            newReplyIds = setOf("a2"),
        )

        composeTestRule.onAllNodesWithText("New").assertCountEqualsTo(2)
    }

    @Test
    fun aCorrectionInProgressHidesTheComposer() {
        show(thread(message("u1", "It was 3 eggs", role = "user"), correctionState = "running", canReply = false))

        composeTestRule.onNodeWithText("Claude is working on your reply").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Send reply").assertCountEqualsTo(0)
    }

    @Test
    fun aRetryingCorrectionSaysItWillTryAgain() {
        show(thread(correctionState = "retrying", canReply = false))

        composeTestRule.onNodeWithText("Claude ran into a problem and will try again in a few minutes").assertIsDisplayed()
    }

    @Test
    fun anUnknownCorrectionStateReadsAsInProgress() {
        show(thread(correctionState = "deliberating", canReply = true))

        composeTestRule.onNodeWithText("Claude is working on your reply").assertIsDisplayed()
    }

    @Test
    fun everyBlockedReasonIsExplained() {
        val expected =
            mapOf(
                "reply_limit_reached" to "This task has reached its reply limit.",
                "rate_limited" to "You have sent a lot of replies today. Try again later.",
                "budget_exhausted" to "Claude's monthly budget is used up.",
                "a_new_reason" to "Replies are not possible for this task right now.",
            )
        var reason by mutableStateOf(expected.keys.first())
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskThread(
                    thread = thread(canReply = false, replyBlockedReason = reason),
                    draft = ReplyDraft(),
                    newReplyIds = emptySet(),
                    onTextChange = {},
                    onSend = {},
                )
            }
        }
        for ((code, text) in expected) {
            reason = code
            composeTestRule.onNodeWithText(text).assertIsDisplayed()
        }
        composeTestRule.onAllNodesWithText("Send reply").assertCountEqualsTo(0)
    }

    @Test
    fun aBlockedReplyShowsWhenItCanBeTriedAgain() {
        show(
            thread(canReply = false, replyBlockedReason = "rate_limited"),
            draft = ReplyDraft(text = "x", retryAfterSeconds = 7200, waiting = true),
        )

        composeTestRule.onNodeWithText("You can try again in 2 hours.").assertIsDisplayed()
    }

    @Test
    fun typingAndSendingGoThroughTheCallbacks() {
        var text by mutableStateOf("")
        var sent = 0
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskThread(
                    thread = thread(),
                    draft = ReplyDraft(text = text),
                    newReplyIds = emptySet(),
                    onTextChange = { text = it },
                    onSend = { sent++ },
                )
            }
        }

        composeTestRule.onNodeWithText("Send reply").assertIsNotEnabled()
        composeTestRule.onNodeWithText("Reply to Claude").performTextInput("It was 3 eggs")
        composeTestRule.onNodeWithText("Send reply").assertIsEnabled().performClick()

        assertEquals("It was 3 eggs", text)
        assertEquals(1, sent)
        composeTestRule.onNodeWithText("13 / 1000").assertIsDisplayed()
    }

    @Test
    fun aTooLongReplyCannotBeSentAndSaysWhy() {
        show(thread(), draft = ReplyDraft(text = "x".repeat(1001)))

        composeTestRule.onNodeWithText("Keep your reply to 1000 characters or fewer.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Send reply").assertIsNotEnabled()
    }

    @Test
    fun aFailedSendKeepsTheTextAndSaysWhatToDo() {
        show(
            thread(),
            draft = ReplyDraft(text = "It was 3 eggs", failure = ReplyFailure.TOO_MANY_REQUESTS, retryAfterSeconds = 90, waiting = true),
        )

        composeTestRule.onNodeWithText("It was 3 eggs").assertIsDisplayed()
        composeTestRule.onNodeWithText("Too many requests at the moment.").assertIsDisplayed()
        composeTestRule.onNodeWithText("You can try again in 2 minutes.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Send reply").assertIsNotEnabled()
    }

    @Test
    fun whileSendingTheButtonSaysSo() {
        show(thread(), draft = ReplyDraft(text = "It was 3 eggs", sending = true))

        composeTestRule.onNodeWithText("Sending reply").assertIsNotEnabled()
    }

    @Test
    fun aShortWaitReadsAsAMoment() {
        show(thread(), draft = ReplyDraft(text = "x", failure = ReplyFailure.STILL_SENDING, retryAfterSeconds = 2, waiting = true))

        composeTestRule.onNodeWithText("Your reply is still being sent.").assertIsDisplayed()
        composeTestRule.onNodeWithText("You can try again in a moment.").assertIsDisplayed()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertCountEqualsTo(count: Int) {
        assertEquals(count, fetchSemanticsNodes().size)
    }
}
