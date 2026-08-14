package com.bissbilanz.android.fasting

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.java.KoinJavaComponent

/**
 * Marks the day a notification-ended fast finished on as a fasting day. Split out
 * of [EndFastReceiver] so the write survives the receiver's short process lifetime.
 */
class EndFastWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        return try {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            koin.get<EntryRepository>().setDayProperties(today, isFastingDay = true)
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            Result.retry()
        }
    }
}
