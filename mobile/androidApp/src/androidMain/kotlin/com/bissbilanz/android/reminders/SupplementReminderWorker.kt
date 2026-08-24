package com.bissbilanz.android.reminders

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent

/**
 * Logs a supplement tapped as taken from a reminder. Split out of
 * [SupplementReminderActionReceiver] so the write survives the receiver's short process
 * lifetime.
 *
 * Goes through the repository rather than the API directly, so an offline tap lands in
 * the sync queue and drains later. A duplicate reaching the server is harmless: the
 * partial unique index on food_entries makes logging idempotent per (supplement, day).
 */
class SupplementReminderWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        return try {
            val supplementId = inputData.getString(KEY_SUPPLEMENT_ID) ?: return Result.failure()
            val date = inputData.getString(KEY_DATE) ?: return Result.failure()
            koin.get<SupplementRepository>().logSupplement(supplementId, date)
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            Result.retry()
        }
    }

    companion object {
        const val KEY_SUPPLEMENT_ID = "supplement_id"
        const val KEY_DATE = "date"
    }
}
