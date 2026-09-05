package com.bissbilanz.android.aitasks

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTaskCreate
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Uploads a queued meal — photos first, then the task — outside the sheet that
 * captured it. Doing this in the composable's own scope meant leaving the app, or
 * a slow uplink outlasting the request timeout, lost the meal after the user had
 * already tapped Send. WorkManager keeps the photos on disk, retries with backoff
 * behind a network constraint, and survives the process being killed.
 *
 * The task's idempotency key is fixed in the input data so a retry that failed
 * after the server had already created the task cannot create it twice.
 */
class AiTaskUploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
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
            // Refresh so an open list shows the task without a pull; the repo's
            // refresh swallows nothing, hence the catch.
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
        private const val KEY_DATE = "date"
        private const val KEY_DESCRIPTION = "description"
        private const val KEY_MEAL_TYPE = "mealType"
        private const val KEY_EATEN_AT = "eatenAt"
        private const val KEY_PHOTO_PATHS = "photoPaths"
        private const val KEY_IDEMPOTENCY_KEY = "idempotencyKey"

        /**
         * Writes the already-encoded JPEGs to the cache dir and enqueues the upload.
         * Returns once the work is scheduled, which is when the sheet can close.
         */
        fun enqueue(
            context: Context,
            date: String,
            description: String?,
            mealType: String?,
            eatenAt: String?,
            photos: List<ByteArray>,
        ) {
            val dir = File(context.cacheDir, "ai_task_uploads").apply { mkdirs() }
            val paths =
                photos.map { bytes ->
                    File(dir, "${UUID.randomUUID()}.jpg").apply { writeBytes(bytes) }.absolutePath
                }
            val input: Data =
                workDataOf(
                    KEY_DATE to date,
                    KEY_DESCRIPTION to description,
                    KEY_MEAL_TYPE to mealType,
                    KEY_EATEN_AT to eatenAt,
                    KEY_PHOTO_PATHS to paths.toTypedArray(),
                    KEY_IDEMPOTENCY_KEY to UUID.randomUUID().toString(),
                )
            val work =
                OneTimeWorkRequestBuilder<AiTaskUploadWorker>()
                    .setInputData(input)
                    .addTag(TAG)
                    .setConstraints(
                        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                    ).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            WorkManager.getInstance(context).enqueue(work)
        }
    }
}
