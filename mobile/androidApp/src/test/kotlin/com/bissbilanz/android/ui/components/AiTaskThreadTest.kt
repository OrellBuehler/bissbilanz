package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
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
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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
    fun whileSendingTheButtonKeepsItsLabelAndWidthAndSaysSoToAccessibility() {
        var sending by mutableStateOf(false)
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskThread(thread(), ReplyDraft(text = "It was 3 eggs", sending = sending), emptySet(), {}, {})
            }
        }
        val idleWidth =
            composeTestRule
                .onNodeWithText("Send reply")
                .fetchSemanticsNode()
                .size.width

        sending = true

        val button = composeTestRule.onNodeWithText("Send reply")
        button.assertIsNotEnabled()
        button.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Sending reply"))
        assertEquals(idleWidth, button.fetchSemanticsNode().size.width)
    }

    @Test
    fun noSentenceForATaskThatIsNotCompletedOrHasNoReason() {
        var reason by mutableStateOf<String?>("not_completed")
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskThread(thread(canReply = false, replyBlockedReason = reason), ReplyDraft(), emptySet(), {}, {})
            }
        }
        composeTestRule.onAllNodesWithText("Replies are possible once this task is completed.").assertCountEqualsTo(0)

        reason = null

        composeTestRule.onAllNodesWithText("Replies are not possible for this task right now.").assertCountEqualsTo(0)
        composeTestRule.onAllNodesWithText("Send reply").assertCountEqualsTo(0)
    }

    @Test
    fun anAnswerCountsAsShownWhenHalfOfItOrHalfOfTheListIsCovered() {
        assertTrue(isAnswerShown(shownHeight = 50f, bubbleHeight = 100, viewportHeight = 1000))
        assertFalse(isAnswerShown(shownHeight = 49f, bubbleHeight = 100, viewportHeight = 1000))
        assertTrue(isAnswerShown(shownHeight = 300f, bubbleHeight = 2000, viewportHeight = 600))
        assertFalse(isAnswerShown(shownHeight = 299f, bubbleHeight = 2000, viewportHeight = 600))
        assertTrue(isAnswerShown(shownHeight = 50f, bubbleHeight = 100, viewportHeight = 0))
        assertFalse(isAnswerShown(shownHeight = 0f, bubbleHeight = 100, viewportHeight = 0))
        assertFalse(isAnswerShown(shownHeight = 0f, bubbleHeight = 0, viewportHeight = 600))
    }

    @Test
    fun anAnswerTallerThanTheListCountsAsShownWhenItFillsTheList() {
        val visible = mutableMapOf<String, Boolean>()
        val longAnswer = (1..60).joinToString("\n") { "Line $it of a long answer" }
        composeTestRule.setContent {
            val viewport = with(LocalDensity.current) { 120.dp.roundToPx() }
            BissbilanzTheme {
                Column(modifier = Modifier.height(120.dp).verticalScroll(rememberScrollState(initial = 40))) {
                    AiTaskThread(
                        thread(message("a1", longAnswer)),
                        ReplyDraft(),
                        emptySet(),
                        {},
                        {},
                        onAnswerVisible = { id, shown -> visible[id] = shown },
                        viewportHeight = { viewport },
                    )
                }
            }
        }
        composeTestRule.waitForIdle()

        assertEquals(true, visible["a1"])
    }

    @Test
    fun answersReportWhetherTheyAreOnScreenAndUserMessagesDoNot() {
        val visible = mutableMapOf<String, Boolean>()
        composeTestRule.setContent {
            BissbilanzTheme {
                Column(modifier = Modifier.height(140.dp).verticalScroll(rememberScrollState())) {
                    AiTaskThread(
                        thread(
                            message("a1", "First answer"),
                            message("u1", "A question", role = "user"),
                            message("a2", "Second answer\nwith\nseveral\nlines\nof\ntext"),
                        ),
                        ReplyDraft(),
                        emptySet(),
                        {},
                        {},
                        onAnswerVisible = { id, shown -> visible[id] = shown },
                    )
                }
            }
        }
        composeTestRule.waitForIdle()

        assertEquals(true, visible["a1"])
        assertEquals(false, visible["a2"])
        assertEquals(null, visible["u1"])
    }

    @Test
    fun aFocusedComposerIsFocusedAgainAfterTheScreenIsRecreated() {
        val restoration = StateRestorationTester(composeTestRule)
        restoration.setContent {
            BissbilanzTheme { AiTaskThread(thread(), ReplyDraft(text = "It was"), emptySet(), {}, {}) }
        }
        composeTestRule.onNodeWithText("Reply to Claude").performClick()
        composeTestRule.onNodeWithText("Reply to Claude").assertIsFocused()

        restoration.emulateSavedInstanceStateRestore()

        composeTestRule.onNodeWithText("Reply to Claude").assertIsFocused()
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
