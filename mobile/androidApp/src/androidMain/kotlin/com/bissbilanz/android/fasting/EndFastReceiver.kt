package com.bissbilanz.android.fasting

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.koin.java.KoinJavaComponent
import kotlin.time.Clock

/**
 * Handles End Fast from the ongoing notification. The visible work — clearing
 * the session and the notification — happens inline so the UI reacts instantly;
 * the day-properties write is handed to a worker because a receiver's process
 * can be killed as soon as onReceive returns.
 */
class EndFastReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val koin = KoinJavaComponent.getKoin()
        try {
            val store = koin.get<FastingSessionStore>()
            val current = store.loadCurrent() ?: return
            val endedAt = Clock.System.now()
            val ended = current.copy(endedAtEpochMs = endedAt.toEpochMilliseconds())
            store.appendToHistory(ended)
            store.clearCurrent()
            FastingNotifier.clear(context)
            // Pull the manager's in-memory state back in line with the store it no
            // longer matches: without this a screen already in composition keeps
            // counting, and ending again from there would append a second history
            // record for the same fast.
            koin.get<FastingManager>().refresh()
            val endedDate = endedAt.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
            WorkManager.getInstance(context).enqueue(
                OneTimeWorkRequestBuilder<EndFastWorker>()
                    .setInputData(workDataOf(EndFastWorker.KEY_DATE to endedDate))
                    .build(),
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
        }
    }
}
