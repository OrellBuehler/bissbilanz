package com.bissbilanz.android.bulk

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.jwtSubject
import com.bissbilanz.foodpackage.BulkFoodUploader
import com.bissbilanz.foodpackage.BulkUploadStore
import com.bissbilanz.mode.AppModeManager
import org.koin.java.KoinJavaComponent
import java.util.concurrent.TimeUnit

/**
 * Uploads bulk-imported foods to the account in the background, over as many runs as it takes.
 *
 * It is unique work behind a network constraint (Wi-Fi only when the user chose so) and the
 * queue lives in the database, so it survives the process being killed and resumes where it
 * stopped. A run that uses up its time budget queues the next one; only the account that
 * queued a food ever uploads it.
 */
class BulkUploadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        if (koin.get<AppModeManager>().isLocal) return Result.success()
        val preferences = koin.get<BulkUploadPreferences>()
        if (preferences.paused.value) return Result.success()
        // Signed out: the rows were wiped with the account, or will be picked up on the next sign-in.
        val userId = jwtSubject(koin.get<AuthManager>().getAccessToken()) ?: return Result.success()
        val store = koin.get<BulkUploadStore>()
        store.dropOtherUsers(userId)
        val uploader = koin.get<BulkFoodUploader>()
        val runner =
            BulkUploadRunner(
                uploadNext = { user -> uploader.uploadNext(user) },
                isPaused = { preferences.paused.value },
                isStopped = { isStopped },
                onProgress = { },
                errorReporter = koin.get<ErrorReporter>(),
            )
        return when (runner.run(userId)) {
            BulkUploadRunner.Outcome.DONE -> {
                store.clearFinished(userId)
                Result.success()
            }
            BulkUploadRunner.Outcome.PAUSED -> Result.success()
            BulkUploadRunner.Outcome.CONTINUE_LATER -> {
                enqueue(applicationContext, preferences.wifiOnly.value, ExistingWorkPolicy.APPEND_OR_REPLACE)
                Result.success()
            }
            BulkUploadRunner.Outcome.STOPPED, BulkUploadRunner.Outcome.RETRY -> Result.retry()
        }
    }

    companion object {
        const val UNIQUE_NAME = "bulk-food-upload"

        fun enqueue(
            context: Context,
            wifiOnly: Boolean,
            policy: ExistingWorkPolicy = ExistingWorkPolicy.KEEP,
        ) {
            val request =
                OneTimeWorkRequestBuilder<BulkUploadWorker>()
                    .setConstraints(
                        Constraints
                            .Builder()
                            .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
                            .build(),
                    ).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NAME, policy, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME)
        }

        /** Picks the upload back up after an app start or a restore: queued foods and an account to send them to. */
        fun resumeIfNeeded(
            context: Context,
            store: BulkUploadStore,
            preferences: BulkUploadPreferences,
            appModeManager: AppModeManager,
        ) {
            if (appModeManager.isLocal || preferences.paused.value) return
            if (store.counts().pending > 0) enqueue(context, preferences.wifiOnly.value)
        }
    }
}
