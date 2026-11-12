package com.bissbilanz.android.aitasks

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.MainActivity
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.repository.TaskReply
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskNotifierTest.TestApp::class)
class AiTaskNotifierTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private lateinit var prefs: AiTaskNotificationPreferences

    private val task =
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

    private fun reply(
        id: String,
        text: String = "I changed it to 3 eggs.",
    ) = TaskReply(
        task,
        AiTaskThreadMessage(
            id = id,
            role = "assistant",
            text = text,
            outcome = "changed",
            createdAt = "2026-10-12T10:01:00Z",
            unread = true,
        ),
    )

    private val notificationManager get() = context.getSystemService(NotificationManager::class.java)

    private fun posted() = shadowOf(notificationManager).allNotifications

    @Before
    fun setup() {
        context
            .getSharedPreferences("ai_task_notifications", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        prefs = AiTaskNotificationPreferences(context)
    }

    @Test
    fun eachAnswerIsPostedWithItsTextUnderOneSummary() {
        val shown = AiTaskNotifier.showReplies(context, listOf(reply("a1"), reply("a2", "Nothing to change.")))

        assertTrue(shown)
        val children = posted().filterNot { it.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0 }
        assertEquals(2, children.size)
        assertEquals(
            setOf("I changed it to 3 eggs.", "Nothing to change."),
            children.map { it.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString() }.toSet(),
        )
        assertTrue(children.all { it.extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString() == "Claude replied" })
        assertTrue(children.all { it.group == AiTaskNotifier.REPLIES_GROUP_KEY })
        assertTrue(children.all { it.channelId == AiTaskNotifier.CHANNEL_ID })
        assertEquals(1, posted().count { it.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0 })
        val intent = shadowOf(children.first().contentIntent).savedIntent
        assertEquals("ai-tasks", intent.getStringExtra(MainActivity.EXTRA_NAVIGATE_TO))
    }

    @Test
    fun nothingToShowPostsNothing() {
        assertFalse(AiTaskNotifier.showReplies(context, emptyList()))
        assertTrue(posted().isEmpty())
    }

    @Test
    fun eachAnswerIsAnnouncedOncePerDevice() {
        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1")), setOf("u1", "a1"))
        notificationManager.cancelAll()

        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1"), reply("a2")), setOf("u1", "a1", "a2"))

        val texts = posted().filterNot { it.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0 }
        assertEquals(1, texts.size)
        assertEquals(setOf("a1", "a2"), prefs.notifiedReplies)
    }

    @Test
    fun answersTheServerNoLongerReturnsAreForgotten() {
        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1")), setOf("a1"))

        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a2")), setOf("a2"))

        assertEquals(setOf("a2"), prefs.notifiedReplies)
    }

    @Test
    fun answersDoNotTouchTheAnnouncedDismissals() {
        prefs.markNotified(listOf("d1"), setOf("d1"))

        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1")), setOf("a1"))

        assertEquals(setOf("d1"), prefs.notified)
        assertEquals(listOf("a2"), prefs.unnotifiedReplies(listOf("a1", "a2")))
    }

    @Test
    @Config(sdk = [33])
    fun withoutThePermissionNothingIsPostedOrRecordedSoTheAnswerIsToldLater() {
        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1")), setOf("a1"))

        assertTrue(posted().isEmpty())
        assertEquals(emptySet(), prefs.notifiedReplies)

        shadowOf(context as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        AiTaskNotifier.announceReplies(context, prefs, listOf(reply("a1")), setOf("a1"))

        assertEquals(1, posted().count { it.flags and android.app.Notification.FLAG_GROUP_SUMMARY == 0 })
        assertEquals(setOf("a1"), prefs.notifiedReplies)
    }
}
