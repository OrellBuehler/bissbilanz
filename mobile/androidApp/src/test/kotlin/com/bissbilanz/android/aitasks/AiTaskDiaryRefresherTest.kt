package com.bissbilanz.android.aitasks

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.repository.EntryRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException
import kotlin.test.assertFailsWith

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskDiaryRefresherTest.TestApp::class)
class AiTaskDiaryRefresherTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private lateinit var entryRepository: EntryRepository
    private lateinit var prefs: AiTaskNotificationPreferences

    @Before
    fun setup() {
        context
            .getSharedPreferences("ai_task_notifications", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        entryRepository = mockk(relaxed = true)
        prefs = AiTaskNotificationPreferences(context)
    }

    @Test
    fun eachChangeRefreshesItsDayOnceAcrossProcessStarts() =
        runTest {
            val changed =
                listOf(taskReply("a1", date = "2026-10-12"), taskReply("a2", date = "2026-10-12"), taskReply("a3", date = "2026-10-13"))

            AiTaskDiaryRefresher(entryRepository, prefs).refresh(changed)
            AiTaskDiaryRefresher(entryRepository, AiTaskNotificationPreferences(context)).refresh(changed)

            coVerify(exactly = 1) { entryRepository.refreshWithoutViewing("2026-10-12") }
            coVerify(exactly = 1) { entryRepository.refreshWithoutViewing("2026-10-13") }
            coVerify(exactly = 0) { entryRepository.refresh(any()) }
        }

    @Test
    fun aFailedRefreshIsTriedAgainOnTheNextRead() =
        runTest {
            coEvery { entryRepository.refreshWithoutViewing("2026-10-12") } throws IOException("offline") andThen Unit
            val refresher = AiTaskDiaryRefresher(entryRepository, prefs)

            assertFailsWith<IOException> { refresher.refresh(listOf(taskReply("a1"))) }
            refresher.refresh(listOf(taskReply("a1")))
            refresher.refresh(listOf(taskReply("a1")))

            coVerify(exactly = 2) { entryRepository.refreshWithoutViewing("2026-10-12") }
        }
}
