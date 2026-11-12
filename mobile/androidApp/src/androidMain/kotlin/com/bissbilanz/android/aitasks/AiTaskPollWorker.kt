package com.bissbilanz.android.aitasks

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.AiTaskRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent
import java.util.concurrent.TimeUnit

/**
 * Pulls AI tasks while the app is closed, so a dismissal or an answer from Claude reaches
 * the user without them opening the app first.
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
        return try {
            if (koin.get<AppModeManager>().isLocal) return Result.success()
            if (koin.get<AuthManager>().getAccessToken() == null) return Result.success()
            // The repository's onUnreadDismissals and onUnreadReplies hooks, wired in
            // BissbilanzApplication, post the notifications.
            koin.get<AiTaskRepository>().refresh()
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            val result = afterFailure(e, inputData.getBoolean(KEY_REPLY_CHECK, false), runAttemptCount)
            if (result != Result.success()) runCatching { koin.get<ErrorReporter>().captureException(e) }
            result
        }
    }

    companion object {
        private const val WORK_NAME = "ai_task_poll"
        const val REPLY_CHECK_WORK_NAME = "ai_task_reply_check"
        const val REPLY_CHECK_DELAY_SECONDS = 60L
        const val MAX_REPLY_CHECK_ATTEMPTS = 3
        private const val KEY_REPLY_CHECK = "reply_check"

        fun afterFailure(
            e: Exception,
            replyCheck: Boolean,
            runAttemptCount: Int,
        ): Result =
            when {
                e is UnauthorizedException -> Result.success()
                replyCheck && runAttemptCount + 1 >= MAX_REPLY_CHECK_ATTEMPTS -> Result.failure()
                else -> Result.retry()
            }

        private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun scheduleReplyCheck(context: Context) {
            val work =
                OneTimeWorkRequestBuilder<AiTaskPollWorker>()
                    .setInitialDelay(REPLY_CHECK_DELAY_SECONDS, TimeUnit.SECONDS)
                    .setConstraints(constraints())
                    .setInputData(workDataOf(KEY_REPLY_CHECK to true))
                    .build()
            WorkManager.getInstance(context).enqueueUniqueWork(REPLY_CHECK_WORK_NAME, ExistingWorkPolicy.REPLACE, work)
        }

        fun enqueue(context: Context) {
            val work =
                PeriodicWorkRequestBuilder<AiTaskPollWorker>(
                    30,
                    TimeUnit.MINUTES,
                    15,
                    TimeUnit.MINUTES,
                ).setConstraints(constraints())
                    .build()
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
