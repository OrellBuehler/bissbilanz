package com.bissbilanz.android.aitasks

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTaskCreate
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.CancellationException
import org.koin.core.Koin
import org.koin.java.KoinJavaComponent
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Uploads a queued meal — photos first, then the task — outside the sheet that
 * captured it. Doing this in the composable's own scope meant leaving the app, or
 * a slow uplink outlasting the request timeout, lost the meal after the user had
 * already tapped Send. WorkManager retries with backoff behind a network
 * constraint and survives the process being killed; [AiTaskUploadQueue] is what
 * survives the process being killed *before* WorkManager gets to run at all, and
 * what keeps a meal that exhausted every retry around for the user to act on
 * instead of deleting it — mirroring iOS's AiTaskStore/AiTaskUploadDisk pair.
 *
 * The task's idempotency key is fixed on the queued item so a retry that failed
 * after the server had already created the task cannot create it twice.
 */
class AiTaskUploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        val queueId = inputData.getString(KEY_QUEUE_ID) ?: return legacyDoWork(koin)
        val queue = koin.get<AiTaskUploadQueue>()
        // Already delivered or discarded while this attempt was scheduled.
        val item = queue.get(queueId) ?: return Result.success()

        return try {
            val api = koin.get<BissbilanzApi>()
            queue.markUploading(item.id)
            val files = item.photoPaths.map(::File)
            val photoUrls =
                files
                    .filter { it.exists() }
                    .mapIndexed { index, file -> "meal_$index.jpg" to file.readBytes() }
                    .takeIf { it.isNotEmpty() }
                    ?.let { api.uploadAiTaskPhotos(it) }
            api.createAiTask(
                AiTaskCreate(
                    date = item.date,
                    description = item.description,
                    photoUrls = photoUrls,
                    mealType = item.mealType,
                    eatenAt = item.eatenAt,
                    source = AiTaskCreate.Source.android,
                ),
                idempotencyKey = item.idempotencyKey,
            )
            queue.remove(item.id)
            // Refresh so an open list shows the task without a pull; the repo's
            // refresh swallows nothing, hence the catch.
            runCatching { koin.get<AiTaskRepository>().refresh() }
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            runCatching { koin.get<ErrorReporter>().captureException(e) }
            val retryable = isRetryable(e)
            if (retryable && runAttemptCount < MAX_ATTEMPTS - 1) {
                Result.retry()
            } else {
                queue.markFailed(item.id, e.message, retryable = false)
                AiTaskNotifier.showUploadFailed(applicationContext, item.description)
                Result.failure()
            }
        }
    }

    /**
     * A job WorkManager had already persisted before the queue existed carries the
     * meal's data directly in its input rather than a queue id. Finishes it the old
     * way — best effort, deleting the photos on final failure — since there is no
     * queued item to keep them in; `enqueue` has not scheduled this shape since, so
     * this only covers jobs already in flight across an app update.
     */
    private suspend fun legacyDoWork(koin: Koin): Result {
        val photoPaths = inputData.getStringArray(KEY_PHOTO_PATHS).orEmpty()
        val files = photoPaths.map(::File)
        return try {
            val api = koin.get<BissbilanzApi>()
            val photoUrls =
                files
                    .filter { it.exists() }
                    .mapIndexed { index, file -> "meal_$index.jpg" to file.readBytes() }
                    .takeIf { it.isNotEmpty() }
                    ?.let { api.uploadAiTaskPhotos(it) }
            api.createAiTask(
                AiTaskCreate(
                    date = inputData.getString(KEY_DATE) ?: return Result.failure(),
                    description = inputData.getString(KEY_DESCRIPTION),
                    photoUrls = photoUrls,
                    mealType = inputData.getString(KEY_MEAL_TYPE),
                    eatenAt = inputData.getString(KEY_EATEN_AT),
                    source = AiTaskCreate.Source.android,
                ),
                idempotencyKey = inputData.getString(KEY_IDEMPOTENCY_KEY),
            )
            files.forEach { it.delete() }
            runCatching { koin.get<AiTaskRepository>().refresh() }
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            runCatching { koin.get<ErrorReporter>().captureException(e) }
            if (runAttemptCount < MAX_ATTEMPTS - 1) {
                Result.retry()
            } else {
                files.forEach { it.delete() }
                AiTaskNotifier.showUploadFailed(applicationContext, inputData.getString(KEY_DESCRIPTION))
                Result.failure()
            }
        }
    }

    companion object {
        const val TAG = "ai_task_upload"
        private const val MAX_ATTEMPTS = 4
        private const val KEY_QUEUE_ID = "queueId"

        // Legacy (pre-queue) input keys — read only by legacyDoWork, for jobs
        // WorkManager already persisted when the app updates to this version.
        private const val KEY_DATE = "date"
        private const val KEY_DESCRIPTION = "description"
        private const val KEY_MEAL_TYPE = "mealType"
        private const val KEY_EATEN_AT = "eatenAt"
        private const val KEY_PHOTO_PATHS = "photoPaths"
        private const val KEY_IDEMPOTENCY_KEY = "idempotencyKey"

        /**
         * Whether sending the same bytes again can succeed. A 4xx other than the two
         * transient ones means the server rejected the payload itself, so a retry
         * cannot help; everything else is the network or the server's day. Mirrors
         * iOS's `AiTaskStore.isRetryable`.
         */
        fun isRetryable(e: Throwable): Boolean {
            val code = (e as? ApiException)?.statusCode ?: return true
            return code < 400 || code >= 500 || code == 408 || code == 429
        }

        /**
         * Queues the meal on disk and schedules the upload. Returns once both are
         * done, which is when the sheet can close — the upload itself continues in
         * WorkManager.
         */
        fun enqueue(
            context: Context,
            date: String,
            description: String?,
            mealType: String?,
            eatenAt: String?,
            photos: List<ByteArray>,
        ) {
            val queue = KoinJavaComponent.getKoin().get<AiTaskUploadQueue>()
            val item = queue.enqueue(date, description, mealType, eatenAt, photos)
            scheduleWork(context, item.id)
        }

        /** Re-sends a failed upload under a fresh attempt count. */
        fun retry(
            context: Context,
            id: String,
        ) {
            KoinJavaComponent.getKoin().get<AiTaskUploadQueue>().retry(id)
            scheduleWork(context, id)
        }

        /** Cancels any in-flight attempt and drops the item and its photos. */
        fun discard(
            context: Context,
            id: String,
        ) {
            WorkManager.getInstance(context).cancelUniqueWork(workName(id))
            KoinJavaComponent.getKoin().get<AiTaskUploadQueue>().remove(id)
        }

        private fun workName(id: String) = "$TAG:$id"

        private fun scheduleWork(
            context: Context,
            queueId: String,
        ) {
            val input: Data = workDataOf(KEY_QUEUE_ID to queueId)
            val work =
                OneTimeWorkRequestBuilder<AiTaskUploadWorker>()
                    .setInputData(input)
                    .addTag(TAG)
                    .setConstraints(
                        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                    ).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            // Unique per item so a retry replaces rather than races any attempt still
            // scheduled, and so discard can cancel it by id.
            WorkManager.getInstance(context).enqueueUniqueWork(workName(queueId), ExistingWorkPolicy.REPLACE, work)
        }
    }
}
