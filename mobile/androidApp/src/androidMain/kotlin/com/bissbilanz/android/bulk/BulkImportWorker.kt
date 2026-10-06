package com.bissbilanz.android.bulk

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.FoodPackageEvents
import com.bissbilanz.android.navigation.IncomingPackageFiles
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.jwtSubject
import com.bissbilanz.foodpackage.BulkImportSummary
import com.bissbilanz.foodpackage.BulkPackageImporter
import com.bissbilanz.foodpackage.FoodPackageException
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent
import java.io.File

/**
 * Imports a huge food package in the background, with an ongoing notification. Expedited, so
 * it starts at once, and resumable: the importer skips what is already in the food list, so a
 * run that was stopped (low memory, a reboot) simply picks up again.
 *
 * In an account the imported foods are queued for upload (see [BulkUploadWorker]); in Local
 * mode they stay on the device.
 */
class BulkImportWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(0, 0)

    private fun foregroundInfo(
        processed: Int,
        total: Int,
    ): ForegroundInfo {
        ensureChannel(applicationContext)
        val builder =
            NotificationCompat
                .Builder(applicationContext, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_import)
                .setContentTitle(applicationContext.getString(R.string.bulk_import_notification_title))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        if (total > 0) {
            builder
                .setContentText(applicationContext.getString(R.string.bulk_import_progress, formatCount(processed), formatCount(total)))
                .setProgress(total, processed, false)
        } else {
            builder.setProgress(0, 0, true)
        }
        val notification = builder.build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        val errorReporter = koin.get<ErrorReporter>()
        val path = inputData.getString(KEY_PATH) ?: return failure(KIND_UNREADABLE)
        if (!File(path).isFile) return failure(KIND_UNREADABLE)
        try {
            setForeground(foregroundInfo(0, 0))
        } catch (e: IllegalStateException) {
            // Android refuses a foreground service started from the background; the import still runs.
            errorReporter.captureException(e)
        }
        val isLocal = koin.get<AppModeManager>().isLocal
        val userId = if (isLocal) null else jwtSubject(koin.get<AuthManager>().getAccessToken())
        if (!isLocal && userId == null) return failure(KIND_SIGNED_OUT)
        val foods = koin.get<FoodRepository>()
        if (!isLocal) refreshMirror(foods, errorReporter)
        return try {
            val summary =
                koin.get<BulkPackageImporter>().import(path, userId) { progress ->
                    setProgress(
                        workDataOf(KEY_PROCESSED to progress.processed, KEY_TOTAL to progress.total, KEY_CREATED to progress.created),
                    )
                    updateForeground(progress.processed, progress.total, errorReporter)
                }
            IncomingPackageFiles.delete(path)
            foods.onFoodChanged?.invoke()
            FoodPackageEvents.imported.tryEmit(Unit)
            if (summary.queuedForUpload > 0) {
                val preferences = koin.get<BulkUploadPreferences>()
                if (!preferences.paused.value) BulkUploadWorker.enqueue(applicationContext, preferences.wifiOnly.value)
            }
            Result.success(summary.toData())
        } catch (e: FoodPackageException) {
            IncomingPackageFiles.delete(path)
            failure(e.kind.name)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            failure(KIND_FAILED)
        }
    }

    /** A bigger mirror means fewer duplicates: bring it up to date first, as far as the connection allows. */
    private suspend fun refreshMirror(
        foods: FoodRepository,
        errorReporter: ErrorReporter,
    ) {
        try {
            foods.refreshFoods()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private suspend fun updateForeground(
        processed: Int,
        total: Int,
        errorReporter: ErrorReporter,
    ) {
        try {
            setForeground(foregroundInfo(processed, total))
        } catch (e: IllegalStateException) {
            errorReporter.captureException(e)
        }
    }

    private fun failure(kind: String): Result = Result.failure(workDataOf(KEY_ERROR_KIND to kind))

    companion object {
        const val UNIQUE_NAME = "bulk-food-import"
        const val KEY_PATH = "path"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_PROCESSED = "processed"
        const val KEY_TOTAL = "total"
        const val KEY_CREATED = "created"
        const val KEY_SKIPPED = "skipped"
        const val KEY_INVALID = "invalid"
        const val KEY_IMAGES = "images"
        const val KEY_IMAGES_MISSING = "images_missing"
        const val KEY_RECIPES_SKIPPED = "recipes_skipped"
        const val KEY_QUEUED = "queued"
        const val KEY_ERROR_KIND = "error_kind"
        const val KIND_UNREADABLE = "UNREADABLE"
        const val KIND_SIGNED_OUT = "SIGNED_OUT"
        const val KIND_FAILED = "FAILED"

        private const val CHANNEL_ID = "food_import"
        private const val NOTIFICATION_ID = 4500

        private fun ensureChannel(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.bulk_import_channel),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { description = context.getString(R.string.bulk_import_channel_desc) },
            )
        }
    }
}

internal fun BulkImportSummary.toData() =
    workDataOf(
        BulkImportWorker.KEY_TOTAL to foodsInPackage,
        BulkImportWorker.KEY_CREATED to created,
        BulkImportWorker.KEY_SKIPPED to skippedExisting,
        BulkImportWorker.KEY_INVALID to invalid,
        BulkImportWorker.KEY_IMAGES to images,
        BulkImportWorker.KEY_IMAGES_MISSING to imagesMissing,
        BulkImportWorker.KEY_RECIPES_SKIPPED to recipesSkipped,
        BulkImportWorker.KEY_QUEUED to queuedForUpload,
    )
