package com.bissbilanz.android.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import com.bissbilanz.ErrorReporter
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import org.koin.java.KoinJavaComponent

/** When a reminder alarm should go off, and the calendar date it is *for*. */
data class ReminderTrigger(
    val atMillis: Long,
    val date: LocalDate,
)

/**
 * Shared by the supplement and the general logging reminder schedulers.
 *
 * Alarms are exact whenever the user allows it ("Alarms & reminders" special access,
 * `SCHEDULE_EXACT_ALARM`) and fall back to `setAndAllowWhileIdle` otherwise. The inexact
 * fallback can arrive many minutes late while the phone is idle — long enough that a
 * freshly set test time looks like it never fired — so the Reminders screen and the
 * editors ask for the access instead of silently settling for it.
 */
object ReminderAlarms {
    /**
     * Wall-clock [at] in [zone]. A time that does not exist on a spring-forward day
     * (02:30 where the clocks jump 02:00 to 03:00) resolves forward by the length of the
     * gap, so the reminder still fires that day rather than being skipped.
     */
    fun trigger(
        at: LocalDateTime,
        zone: TimeZone,
    ): ReminderTrigger = ReminderTrigger(at.toInstant(zone).toEpochMilliseconds(), at.date)

    /** API 31 introduced the exact-alarm gate; below it exact alarms need no permission. */
    fun shouldUseExact(
        sdkInt: Int,
        exactAccessGranted: Boolean,
    ): Boolean = sdkInt < Build.VERSION_CODES.S || exactAccessGranted

    /** False when the user still has to grant the special access for on-time reminders. */
    fun canScheduleExact(context: Context): Boolean {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
        return canScheduleExact(alarmManager)
    }

    fun set(
        alarmManager: AlarmManager,
        triggerAtMillis: Long,
        operation: PendingIntent,
    ) {
        if (canScheduleExact(alarmManager)) {
            try {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
                return
            } catch (e: SecurityException) {
                // Access was revoked between the check and the call. Still arm the
                // reminder inexactly, and tell Sentry — it should be a vanishing race.
                KoinJavaComponent.getKoin().get<ErrorReporter>().captureException(e)
            }
        }
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
    }

    private fun canScheduleExact(alarmManager: AlarmManager): Boolean =
        shouldUseExact(
            Build.VERSION.SDK_INT,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms(),
        )
}
