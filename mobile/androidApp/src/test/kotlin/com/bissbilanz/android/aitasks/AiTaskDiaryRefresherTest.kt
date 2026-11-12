package com.bissbilanz.android.aitasks

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.repository.EntryRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskDiaryRefresherTest.TestApp::class)
class AiTaskDiaryRefresherTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private lateinit var entryRepository: EntryRepository
    private lateinit var errorReporter: ErrorReporter
    private lateinit var prefs: AiTaskNotificationPreferences
    private lateinit var refresher: AiTaskDiaryRefresher

    @Before
    fun setup() {
        context
            .getSharedPreferences("ai_task_notifications", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        entryRepository = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        prefs = AiTaskNotificationPreferences(context)
        refresher = AiTaskDiaryRefresher(entryRepository, prefs, errorReporter)
    }

    @Test
    fun eachChangeRefreshesItsDayOnceAcrossProcessStarts() =
        runTest {
            val changed =
                listOf(taskReply("a1", date = "2026-10-12"), taskReply("a2", date = "2026-10-12"), taskReply("a3", date = "2026-10-13"))

            refresher.refresh(changed)
            AiTaskDiaryRefresher(entryRepository, AiTaskNotificationPreferences(context), errorReporter).refresh(changed)

            coVerify(exactly = 1) { entryRepository.refreshWithoutViewing("2026-10-12") }
            coVerify(exactly = 1) { entryRepository.refreshWithoutViewing("2026-10-13") }
            coVerify(exactly = 0) { entryRepository.refresh(any()) }
        }

    @Test
    fun oneFailingDayDoesNotStopTheOthers() =
        runTest {
            coEvery { entryRepository.refreshWithoutViewing("2026-10-12") } throws IOException("offline")

            refresher.refresh(listOf(taskReply("a1", date = "2026-10-12"), taskReply("a2", date = "2026-10-13")))

            coVerify(exactly = 1) { entryRepository.refreshWithoutViewing("2026-10-13") }
            assertEquals(listOf("a1"), prefs.unrefreshedChanges(listOf("a1", "a2")))
        }

    @Test
    fun aFailedRefreshIsRetriedOnALaterReadEvenOnceTheAnswerWasRead() =
        runTest {
            coEvery { entryRepository.refreshWithoutViewing("2026-10-12") } throws IOException("offline") andThen Unit

            refresher.refresh(listOf(taskReply("a1")))
            refresher.refresh(emptyList())
            refresher.refresh(emptyList())

            coVerify(exactly = 2) { entryRepository.refreshWithoutViewing("2026-10-12") }
            assertEquals(emptyList(), prefs.unrefreshedChanges(listOf("a1")))
        }

    @Test
    fun retriesStopAfterTheirLimit() =
        runTest {
            coEvery { entryRepository.refreshWithoutViewing(any()) } throws IOException("offline")

            repeat(AiTaskDiaryRefresher.MAX_ATTEMPTS + 3) { refresher.refresh(listOf(taskReply("a1"))) }

            coVerify(exactly = AiTaskDiaryRefresher.MAX_ATTEMPTS) { entryRepository.refreshWithoutViewing(any()) }
        }

    @Test
    fun networkFailuresLeaveABreadcrumbAndOthersAreReported() =
        runTest {
            val serverError = ApiException("boom", 500)
            coEvery { entryRepository.refreshWithoutViewing("2026-10-12") } throws IOException("offline")
            coEvery { entryRepository.refreshWithoutViewing("2026-10-13") } throws serverError

            refresher.refresh(listOf(taskReply("a1", date = "2026-10-12"), taskReply("a2", date = "2026-10-13")))

            verify(exactly = 1) { errorReporter.addBreadcrumb(any(), "ai-task") }
            verify(exactly = 1) { errorReporter.captureException(serverError) }
        }
}
