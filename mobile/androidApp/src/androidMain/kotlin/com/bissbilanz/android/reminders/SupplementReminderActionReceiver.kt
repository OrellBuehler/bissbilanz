package com.bissbilanz.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.java.KoinJavaComponent
import kotlin.time.Clock

/**
 * Handles the reminder's three action buttons. Everything visible happens inline so the
 * shade reacts instantly; the durable log write goes to a worker because the receiver's
 * process can be killed the moment onReceive returns.
 */
class SupplementReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val supplementId = intent.getStringExtra(EXTRA_SUPPLEMENT_ID) ?: return
        val hhmm = intent.getStringExtra(EXTRA_TIME) ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        val koin = KoinJavaComponent.getKoin()

        try {
            if (notificationId != -1) SupplementReminderNotifier.clear(context, notificationId)
            // The day the reminder was *for*, carried through the notification: a 20:00
            // reminder acted on at 00:30 must log the day it fired, not the day of the
            // tap. Fallback covers notifications posted by a version without the extra.
            val date =
                intent
                    .getStringExtra(EXTRA_DATE)
                    ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                    ?: Clock.System.todayIn(TimeZone.currentSystemDefault())

            when (intent.action) {
                ACTION_TAKEN ->
                    WorkManager.getInstance(context).enqueue(
                        OneTimeWorkRequestBuilder<SupplementReminderWorker>()
                            .setInputData(
                                workDataOf(
                                    SupplementReminderWorker.KEY_SUPPLEMENT_ID to supplementId,
                                    // Resolved here, not in the worker: a retry after
                                    // midnight must not log the wrong day either.
                                    SupplementReminderWorker.KEY_DATE to date.toString(),
                                ),
                            ).build(),
                    )

                ACTION_SNOOZE -> {
                    val preferences = koin.get<SupplementReminderPreferences>()
                    SupplementReminderScheduler.armSnooze(
                        context,
                        supplementId,
                        hhmm,
                        preferences.snoozeMinutes,
                        occurrenceDate = date.toString(),
                    )
                }

                ACTION_SKIP -> koin.get<SupplementReminderPreferences>().markSkipped(supplementId, date)
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
        }
    }

    companion object {
        const val ACTION_TAKEN = "com.bissbilanz.android.SUPPLEMENT_TAKEN"
        const val ACTION_SNOOZE = "com.bissbilanz.android.SUPPLEMENT_SNOOZE"
        const val ACTION_SKIP = "com.bissbilanz.android.SUPPLEMENT_SKIP"
        const val EXTRA_SUPPLEMENT_ID = "supplement_id"
        const val EXTRA_TIME = "reminder_time"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_DATE = "occurrence_date"
    }
}
