package com.bissbilanz.android.aitasks

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent
import java.util.concurrent.TimeUnit

/**
 * Pulls AI tasks while the app is closed, so a dismissal reaches the user without them
 * opening the app first.
 *
 * Nothing else covers this on Android: the only other periodic work is a side effect of
 * placing a widget, and there is no push channel. The 30/15 cadence matches those widget
 * workers rather than inventing a second one.
 */
class AiTaskPollWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        if (koin.get<AppModeManager>().isLocal) return Result.success()
        return try {
            // The repository's onUnreadDismissals hook, wired in BissbilanzApplication,
            // posts the notification.
            koin.get<AiTaskRepository>().refresh()
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "ai_task_poll"

        fun enqueue(context: Context) {
            val work =
                PeriodicWorkRequestBuilder<AiTaskPollWorker>(
                    30,
                    TimeUnit.MINUTES,
                    15,
                    TimeUnit.MINUTES,
                ).setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                ).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                // KEEP so an app restart doesn't reset the interval and effectively
                // never run.
                ExistingPeriodicWorkPolicy.KEEP,
                work,
            )
        }
    }
}
