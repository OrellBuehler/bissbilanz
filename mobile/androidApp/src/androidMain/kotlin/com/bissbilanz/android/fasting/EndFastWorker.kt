package com.bissbilanz.android.fasting

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import org.koin.java.KoinJavaComponent
import kotlin.time.Clock

/**
 * Marks the day a notification-ended fast finished on as a fasting day and queues
 * the finished fast for upload. Split out of [EndFastReceiver] so the writes
 * survive the receiver's short process lifetime.
 */
class EndFastWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin = KoinJavaComponent.getKoin()
        return try {
            // The date the fast actually ended, passed in by the receiver: a retry
            // that runs after midnight must not flag the following day instead.
            val date =
                inputData.getString(KEY_DATE)
                    ?: Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            inputData
                .getString(KEY_SESSION)
                ?.let { koin.get<Json>().decodeOrNull<FastingSession>(it) }
                ?.let { session ->
                    koin.get<SyncQueue>().enqueue(
                        SyncOperation.UpsertFast(session.id, koin.get<Json>().encodeToString(session.toUpsert())),
                    )
                }
            koin.get<EntryRepository>().setDayProperties(date, isFastingDay = true)
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            Result.retry()
        }
    }

    companion object {
        const val KEY_DATE = "ended_date"
        const val KEY_SESSION = "ended_session"
    }
}
