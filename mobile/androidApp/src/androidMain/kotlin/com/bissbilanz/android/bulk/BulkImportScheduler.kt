package com.bissbilanz.android.bulk

import android.content.Context
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.bissbilanz.foodpackage.BulkImportSummary
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Where a bulk package import is, as the import screen shows it. */
sealed interface BulkImportStatus {
    data object Idle : BulkImportStatus

    data class Running(
        val processed: Int,
        val total: Int,
        val created: Int,
    ) : BulkImportStatus

    data class Finished(
        val summary: BulkImportSummary,
    ) : BulkImportStatus

    /** [kind] is a `FoodPackageException.Kind` name or one of the worker's own `KIND_` values. */
    data class Failed(
        val kind: String,
    ) : BulkImportStatus
}

/** Starts the [BulkImportWorker] and reports on it from WorkManager's own records. */
class BulkImportScheduler(
    private val context: Context,
) {
    fun start(
        path: String,
        fileName: String,
    ) {
        val request =
            OneTimeWorkRequestBuilder<BulkImportWorker>()
                .setInputData(workDataOf(BulkImportWorker.KEY_PATH to path, BulkImportWorker.KEY_FILE_NAME to fileName))
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
        WorkManager.getInstance(context).enqueueUniqueWork(BulkImportWorker.UNIQUE_NAME, ExistingWorkPolicy.KEEP, request)
    }

    val status: Flow<BulkImportStatus>
        get() =
            WorkManager
                .getInstance(context)
                .getWorkInfosForUniqueWorkFlow(BulkImportWorker.UNIQUE_NAME)
                .map { infos -> statusOf(infos.lastOrNull()) }

    /** The user has seen how it ended: forget the finished run. */
    fun acknowledge() {
        WorkManager.getInstance(context).pruneWork()
    }

    companion object {
        internal fun statusOf(info: WorkInfo?): BulkImportStatus =
            when (info?.state) {
                null, WorkInfo.State.CANCELLED -> BulkImportStatus.Idle
                WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> BulkImportStatus.Running(0, 0, 0)
                WorkInfo.State.RUNNING ->
                    BulkImportStatus.Running(
                        info.progress.getInt(BulkImportWorker.KEY_PROCESSED, 0),
                        info.progress.getInt(BulkImportWorker.KEY_TOTAL, 0),
                        info.progress.getInt(BulkImportWorker.KEY_CREATED, 0),
                    )
                WorkInfo.State.SUCCEEDED -> BulkImportStatus.Finished(summaryOf(info.outputData))
                WorkInfo.State.FAILED ->
                    BulkImportStatus.Failed(info.outputData.getString(BulkImportWorker.KEY_ERROR_KIND) ?: BulkImportWorker.KIND_FAILED)
            }

        private fun summaryOf(data: Data) =
            BulkImportSummary(
                foodsInPackage = data.getInt(BulkImportWorker.KEY_TOTAL, 0),
                created = data.getInt(BulkImportWorker.KEY_CREATED, 0),
                skippedExisting = data.getInt(BulkImportWorker.KEY_SKIPPED, 0),
                invalid = data.getInt(BulkImportWorker.KEY_INVALID, 0),
                images = data.getInt(BulkImportWorker.KEY_IMAGES, 0),
                imagesMissing = data.getInt(BulkImportWorker.KEY_IMAGES_MISSING, 0),
                recipesSkipped = data.getInt(BulkImportWorker.KEY_RECIPES_SKIPPED, 0),
                queuedForUpload = data.getInt(BulkImportWorker.KEY_QUEUED, 0),
            )
    }
}
