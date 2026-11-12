package com.bissbilanz.android.aitasks

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
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
@Config(sdk = [31], application = AiTaskReplyAlertsTest.TestApp::class)
class AiTaskReplyAlertsTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private var now = 1_000_000_000L
    private var checks = 0
    private lateinit var prefs: AiTaskNotificationPreferences
    private lateinit var alerts: AiTaskReplyAlerts

    private val day = 24L * 60 * 60 * 1000

    @Before
    fun setup() {
        context
            .getSharedPreferences("ai_task_notifications", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        prefs = AiTaskNotificationPreferences(context) { now }
        alerts = AiTaskReplyAlerts(context, prefs) { checks++ }
    }

    @Test
    fun eachAnswerIsAnnouncedOncePerDevice() {
        alerts.announce(listOf(taskReply("a1")))
        context.getSystemService(NotificationManager::class.java).cancelAll()

        alerts.announce(listOf(taskReply("a1"), taskReply("a2")))

        assertEquals(1, context.postedNotifications().replies().size)
        assertEquals(emptyList(), prefs.unannouncedReplies(listOf("a1", "a2")))
    }

    @Test
    fun anOlderReadWithoutTheNewestAnswerDoesNotMakeItAnnounceAgain() {
        alerts.announce(listOf(taskReply("a1"), taskReply("a2")))
        context.getSystemService(NotificationManager::class.java).cancelAll()

        alerts.announce(listOf(taskReply("a1")))
        alerts.announce(listOf(taskReply("a1"), taskReply("a2")))

        assertTrue(context.postedNotifications().isEmpty())
    }

    @Test
    fun rememberedAnswersAreForgottenOnlyAfterTheRetention() {
        prefs.markRepliesAnnounced(listOf("a1"))
        now += 44 * day
        prefs.markRepliesAnnounced(listOf("a2"))
        assertEquals(emptyList(), prefs.unannouncedReplies(listOf("a1", "a2")))

        now += 2 * day
        prefs.markRepliesAnnounced(listOf("a3"))

        assertEquals(listOf("a1"), prefs.unannouncedReplies(listOf("a1", "a2", "a3")))
    }

    @Test
    fun answersArriveSilentlyWhileTheListIsOnScreen() =
        runTest {
            val screen = launch { alerts.whileListVisible { awaitCancellation() } }
            runCurrent()
            assertTrue(alerts.isListVisible)

            alerts.announce(listOf(taskReply("a1")))

            assertTrue(context.postedNotifications().isEmpty())
            assertEquals(listOf("a1"), prefs.unannouncedReplies(listOf("a1")))

            screen.cancel()
            runCurrent()
            assertFalse(alerts.isListVisible)
            alerts.announce(listOf(taskReply("a1")))

            assertEquals(1, context.postedNotifications().replies().size)
        }

    @Test
    fun anAnswerShownInTheAppCancelsItsNotificationAndIsNotAnnouncedAgain() {
        alerts.announce(listOf(taskReply("a1"), taskReply("a2")))

        alerts.shown(listOf("a1"))

        assertEquals(1, context.postedNotifications().replies().size)
        alerts.shown(listOf("a2"))
        assertTrue(context.postedNotifications().isEmpty())
        alerts.announce(listOf(taskReply("a1"), taskReply("a2")))
        assertTrue(context.postedNotifications().isEmpty())
    }

    @Test
    fun anAnswerSeenBeforeItWasAnnouncedIsNeverNotified() {
        alerts.shown(listOf("a3"))

        alerts.announce(listOf(taskReply("a3")))

        assertTrue(context.postedNotifications().isEmpty())
    }

    @Test
    fun answersDoNotTouchTheAnnouncedDismissals() {
        prefs.markNotified(listOf("d1"), setOf("d1"))

        alerts.announce(listOf(taskReply("a1")))

        assertEquals(setOf("d1"), prefs.notified)
    }

    @Test
    fun aSentReplyChecksBackOnlyWhileNotificationsAreOn() {
        alerts.scheduleCheck()
        assertEquals(1, checks)

        shadowOf(context.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        alerts.scheduleCheck()

        assertEquals(1, checks)
    }

    @Test
    @Config(sdk = [33])
    fun withoutThePermissionNothingIsPostedRecordedOrScheduled() {
        alerts.announce(listOf(taskReply("a1")))
        alerts.scheduleCheck()

        assertTrue(context.postedNotifications().isEmpty())
        assertEquals(listOf("a1"), prefs.unannouncedReplies(listOf("a1")))
        assertEquals(0, checks)

        shadowOf(context as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        alerts.announce(listOf(taskReply("a1")))

        assertEquals(1, context.postedNotifications().replies().size)
        assertEquals(emptyList(), prefs.unannouncedReplies(listOf("a1")))
    }
}
