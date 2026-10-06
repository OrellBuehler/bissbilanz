package com.bissbilanz.android.bulk

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Data
import androidx.work.WorkInfo
import androidx.work.workDataOf
import com.bissbilanz.foodpackage.BulkImportSummary
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.UUID
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = BulkImportSchedulerTest.TestApp::class)
class BulkImportSchedulerTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun info(
        state: WorkInfo.State,
        output: Data = Data.EMPTY,
        progress: Data = Data.EMPTY,
    ) = WorkInfo(id = UUID.randomUUID(), state = state, tags = emptySet(), outputData = output, progress = progress)

    @Test
    fun nothingRunningMeansIdle() {
        assertEquals(BulkImportStatus.Idle, BulkImportScheduler.statusOf(null))
        assertEquals(BulkImportStatus.Idle, BulkImportScheduler.statusOf(info(WorkInfo.State.CANCELLED)))
    }

    @Test
    fun aQueuedImportCountsAsRunningWithoutNumbersYet() {
        assertEquals(BulkImportStatus.Running(0, 0, 0), BulkImportScheduler.statusOf(info(WorkInfo.State.ENQUEUED)))
    }

    @Test
    fun aRunningImportReportsItsProgress() {
        val progress =
            workDataOf(BulkImportWorker.KEY_PROCESSED to 1_500, BulkImportWorker.KEY_TOTAL to 48_000, BulkImportWorker.KEY_CREATED to 1_200)

        assertEquals(
            BulkImportStatus.Running(1_500, 48_000, 1_200),
            BulkImportScheduler.statusOf(info(WorkInfo.State.RUNNING, progress = progress)),
        )
    }

    @Test
    fun aFinishedImportCarriesTheSummary() {
        val summary = BulkImportSummary(48_000, 47_000, 900, 100, 46_500, 20, 3, 47_000)

        val status = BulkImportScheduler.statusOf(info(WorkInfo.State.SUCCEEDED, output = summary.toData()))

        assertEquals(BulkImportStatus.Finished(summary), status)
    }

    @Test
    fun aFailedImportNamesWhatWentWrong() {
        val output = workDataOf(BulkImportWorker.KEY_ERROR_KIND to "SIGNED_OUT")

        assertEquals(BulkImportStatus.Failed("SIGNED_OUT"), BulkImportScheduler.statusOf(info(WorkInfo.State.FAILED, output = output)))
        assertEquals(BulkImportStatus.Failed(BulkImportWorker.KIND_FAILED), BulkImportScheduler.statusOf(info(WorkInfo.State.FAILED)))
    }

    @Test
    fun theUploadPreferencesSurviveARestart() {
        val first = BulkUploadPreferences(context)
        assertEquals(false, first.paused.value)
        assertEquals(false, first.wifiOnly.value)

        first.setPaused(true)
        first.setWifiOnly(true)

        val second = BulkUploadPreferences(context)
        assertEquals(true, second.paused.value)
        assertEquals(true, second.wifiOnly.value)
    }
}
