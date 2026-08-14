package com.bissbilanz.android.fasting

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException
import org.koin.java.KoinJavaComponent

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
            val ended =
                current.copy(
                    endedAtEpochMs =
                        kotlinx.datetime.Clock.System
                            .now()
                            .toEpochMilliseconds(),
                )
            store.appendToHistory(ended)
            store.clearCurrent()
            FastingNotifier.clear(context)
            WorkManager.getInstance(context).enqueue(
                OneTimeWorkRequestBuilder<EndFastWorker>().build(),
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
        }
    }
}
