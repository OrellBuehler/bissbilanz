package com.bissbilanz.android.aitasks

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.MainActivity
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.util.TaskReply
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

internal val replyTask =
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
        resultSummary = "Logged 2 eggs",
        createdEntryIds = listOf("e1"),
        completedAt = null,
        dismissedAt = null,
        acknowledgedAt = null,
        processedBy = AiTask.ProcessedBy.assistant,
        processedByKind = "claude",
    )

internal fun taskReply(
    id: String,
    text: String = "I changed it to 3 eggs.",
    date: String = "2026-10-12",
    outcome: String = "changed",
) = TaskReply(
    replyTask.copy(date = date),
    AiTaskThreadMessage(id = id, role = "assistant", text = text, outcome = outcome, createdAt = "2026-10-12T10:01:00Z", unread = true),
)

internal fun Context.postedNotifications() = shadowOf(getSystemService(NotificationManager::class.java)).allNotifications

internal fun List<Notification>.replies() = filter { it.flags and Notification.FLAG_GROUP_SUMMARY == 0 }

internal fun List<Notification>.summaries() = filter { it.flags and Notification.FLAG_GROUP_SUMMARY != 0 }

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskNotifierTest.TestApp::class)
class AiTaskNotifierTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun eachAnswerIsPostedWithItsTextUnderOneSummary() {
        val shown = AiTaskNotifier.showReplies(context, listOf(taskReply("a1"), taskReply("a2", "Nothing to change.")))

        assertTrue(shown)
        val replies = context.postedNotifications().replies()
        assertEquals(2, replies.size)
        assertEquals(
            setOf("I changed it to 3 eggs.", "Nothing to change."),
            replies.map { it.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString() }.toSet(),
        )
        assertTrue(replies.all { it.extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString() == "Claude replied" })
        assertTrue(replies.all { it.group == AiTaskNotifier.REPLIES_GROUP_KEY })
        assertTrue(replies.all { it.channelId == AiTaskNotifier.CHANNEL_ID })
        assertEquals(1, context.postedNotifications().summaries().size)
        val intent = shadowOf(replies.first().contentIntent).savedIntent
        assertEquals("ai-tasks", intent.getStringExtra(MainActivity.EXTRA_NAVIGATE_TO))
    }

    @Test
    fun aRepostOfTheSameAnswerDoesNotAlertAgain() {
        AiTaskNotifier.showReplies(context, listOf(taskReply("a1")))
        AiTaskNotifier.showReplies(context, listOf(taskReply("a1")))

        val posted = context.postedNotifications()
        assertEquals(1, posted.replies().size)
        assertTrue(posted.all { it.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0 })
    }

    @Test
    fun nothingToShowPostsNothing() {
        assertFalse(AiTaskNotifier.showReplies(context, emptyList()))
        assertTrue(context.postedNotifications().isEmpty())
    }

    @Test
    fun cancellingAnAnswerRemovesItAndTheSummaryOnceNoneAreLeft() {
        AiTaskNotifier.showReplies(context, listOf(taskReply("a1"), taskReply("a2")))

        AiTaskNotifier.cancelReplies(context, listOf("a1"))

        assertEquals(1, context.postedNotifications().replies().size)
        assertEquals(1, context.postedNotifications().summaries().size)

        AiTaskNotifier.cancelReplies(context, listOf("a2"))

        assertTrue(context.postedNotifications().isEmpty())
    }

    @Test
    fun repliesAreEnabledWhenTheAppMayNotify() {
        assertTrue(AiTaskNotifier.repliesEnabled(context))

        shadowOf(context.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)

        assertFalse(AiTaskNotifier.repliesEnabled(context))
    }
}
