package com.bissbilanz.android.reminders

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent

/**
 * Runs a full reminder reschedule off the caller's thread. Everything that can invalidate
 * an alarm — app start, a supplement change, a sync refresh, boot, a timezone change —
 * enqueues this rather than calling the scheduler directly.
 */
class RescheduleRemindersWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        return try {
            SupplementReminderScheduler.rescheduleAll(
                applicationContext,
                koin.get<SupplementRepository>(),
                koin.get<SupplementReminderPreferences>(),
            )
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_NAME = "supplement-reminders"

        /**
         * Unique work with REPLACE, so the burst of change callbacks a sync refresh
         * produces (one per cached supplement) collapses into a single reschedule.
         */
        fun enqueue(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_NAME,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<RescheduleRemindersWorker>().build(),
            )
        }
    }
}
