package com.bissbilanz.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.java.KoinJavaComponent
import kotlin.time.Clock

/**
 * Handles a logging reminder's two action buttons. Unlike
 * [SupplementReminderActionReceiver], there is no "done" action here — logging a weight,
 * meal or sleep entry isn't a single tap, so tapping the notification body (handled by
 * [ReminderNotifier]'s content intent) is the only way to act on it; this receiver only
 * covers snooze and skip.
 */
class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val hhmm = intent.getStringExtra(EXTRA_TIME) ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        val koin = KoinJavaComponent.getKoin()

        try {
            if (notificationId != -1) ReminderNotifier.clear(context, notificationId)
            // The day the reminder was *for*, carried through the notification: a 20:00
            // reminder acted on at 00:30 must snooze/skip the day it fired, not the day
            // of the tap. Fallback covers notifications posted by a version without the
            // extra.
            val date =
                intent
                    .getStringExtra(EXTRA_DATE)
                    ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                    ?: Clock.System.todayIn(TimeZone.currentSystemDefault())

            when (intent.action) {
                ACTION_SNOOZE -> {
                    // The snooze duration is one shared, device-local setting for both
                    // supplement and general reminders — no separate copy here.
                    val snoozeMinutes = koin.get<SupplementReminderPreferences>().snoozeMinutes
                    ReminderScheduler.armSnooze(
                        context,
                        reminderId,
                        hhmm,
                        snoozeMinutes,
                        occurrenceDate = date.toString(),
                    )
                }

                ACTION_SKIP -> koin.get<ReminderPreferences>().markSkipped(reminderId, date)
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
        }
    }

    companion object {
        const val ACTION_SNOOZE = "com.bissbilanz.android.REMINDER_SNOOZE"
        const val ACTION_SKIP = "com.bissbilanz.android.REMINDER_SKIP"
        const val EXTRA_REMINDER_ID = "reminder_id"
        const val EXTRA_TIME = "reminder_time"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_DATE = "occurrence_date"
    }
}
