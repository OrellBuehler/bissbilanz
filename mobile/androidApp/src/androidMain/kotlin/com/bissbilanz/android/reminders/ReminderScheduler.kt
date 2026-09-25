package com.bissbilanz.android.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.bissbilanz.model.Reminder
import com.bissbilanz.repository.ReminderRepository
import com.bissbilanz.util.ReminderSchedule
import kotlinx.coroutines.flow.first
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock

/**
 * Arms one AlarmManager alarm per reminder, for that reminder's next due occurrence
 * only; the receiver re-arms its own slot after firing. Parallel to
 * [SupplementReminderScheduler] — same `setAndAllowWhileIdle` approach and request-code
 * hashing, but its own armed registry ([ReminderPreferences]) and its own slot-key
 * namespace (the `"reminder:"` prefix in [slotKey]) so the two schedulers can never
 * collide, even incidentally.
 */
object ReminderScheduler {
    /**
     * Cancels every armed alarm, then re-arms from the current reminder rows. Safe to
     * call repeatedly — callers funnel through [RescheduleGeneralRemindersWorker]'s
     * unique work so a burst (e.g. a sync refresh caching many reminders) collapses
     * into one pass.
     */
    suspend fun rescheduleAll(
        context: Context,
        repository: ReminderRepository,
        preferences: ReminderPreferences,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val zone = TimeZone.currentSystemDefault()
        val now = Clock.System.now().toLocalDateTime(zone)

        preferences.pruneSkips(now.date)

        // AlarmManager can't be enumerated, so the persisted registry is the only way to
        // reach an alarm whose reminder has since been deleted or disabled.
        preferences.armed.forEach { slot ->
            val (reminderId, hhmm) = splitSlot(slot) ?: return@forEach
            cancel(context, alarmManager, reminderId, hhmm)
        }

        val reminders = repository.reminders().first()
        val armed = mutableSetOf<String>()
        for (reminder in reminders) {
            if (!reminder.enabled) continue
            val next = ReminderSchedule.nextOccurrence(reminder, now) ?: continue
            arm(context, alarmManager, reminder.id, reminder.time, next, zone)
            armed.add(slotKey(reminder.id, reminder.time))
        }
        preferences.armed = armed
    }

    /** Re-arms a single slot after it fired, without a full sweep. */
    fun armNext(
        context: Context,
        reminder: Reminder,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val zone = TimeZone.currentSystemDefault()
        val now = Clock.System.now().toLocalDateTime(zone)
        val next = ReminderSchedule.nextOccurrence(reminder, now) ?: return
        arm(context, alarmManager, reminder.id, reminder.time, next, zone)
    }

    /** Schedules the snooze re-fire. Its own request code, so it can't cancel the daily alarm. */
    fun armSnooze(
        context: Context,
        reminderId: String,
        hhmm: String,
        delayMinutes: Int,
        occurrenceDate: String,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val triggerAt = System.currentTimeMillis() + delayMinutes * 60_000L
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            triggerAt,
            alarmPendingIntent(context, reminderId, hhmm, isSnooze = true, occurrenceDate = occurrenceDate),
        )
    }

    private fun arm(
        context: Context,
        alarmManager: AlarmManager,
        reminderId: String,
        hhmm: String,
        at: LocalDateTime,
        zone: TimeZone,
    ) {
        alarmManager.setAndAllowWhileIdle(
            // RTC_WAKEUP is wall-clock, so a corrected device clock or a timezone change
            // moves the alarm with it rather than firing at a stale elapsed offset.
            AlarmManager.RTC_WAKEUP,
            at.toInstant(zone).toEpochMilliseconds(),
            // The date this alarm is *for*: the alarm is inexact and can drift past
            // midnight, and the notification can sit unacted-on even longer, so every
            // downstream consumer must use this rather than "today" at its own run time.
            alarmPendingIntent(context, reminderId, hhmm, isSnooze = false, occurrenceDate = at.date.toString()),
        )
    }

    private fun cancel(
        context: Context,
        alarmManager: AlarmManager,
        reminderId: String,
        hhmm: String,
    ) {
        alarmManager.cancel(alarmPendingIntent(context, reminderId, hhmm, isSnooze = false))
        alarmManager.cancel(alarmPendingIntent(context, reminderId, hhmm, isSnooze = true))
    }

    // Explicit component + FLAG_IMMUTABLE, matching SupplementReminderScheduler: neither
    // an implicit nor a mutable PendingIntent, which is what CodeQL's query looks for.
    private fun alarmPendingIntent(
        context: Context,
        reminderId: String,
        hhmm: String,
        isSnooze: Boolean,
        // Null only for `cancel`, which matches on request code and intent filter — the
        // extras play no part, so a date-less cancel still reaches the armed alarm.
        occurrenceDate: String? = null,
    ): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
        intent.setClassName(context, ReminderReceiver::class.java.name)
        intent.setPackage(context.packageName)
        intent.putExtra(ReminderReceiver.EXTRA_REMINDER_ID, reminderId)
        intent.putExtra(ReminderReceiver.EXTRA_TIME, hhmm)
        intent.putExtra(ReminderReceiver.EXTRA_IS_SNOOZE, isSnooze)
        if (occurrenceDate != null) {
            intent.putExtra(ReminderReceiver.EXTRA_DATE, occurrenceDate)
        }
        return PendingIntent.getBroadcast(
            context,
            if (isSnooze) snoozeRequestCode(reminderId, hhmm) else alarmRequestCode(reminderId, hhmm),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * Deterministic so a later `cancel` reconstructs the same PendingIntent. The four
     * derived codes are spread apart so FLAG_UPDATE_CURRENT can't collapse the alarm, the
     * snooze and the three notification actions onto one intent.
     */
    fun alarmRequestCode(
        reminderId: String,
        hhmm: String,
    ): Int = baseCode(reminderId, hhmm) * 8

    fun snoozeRequestCode(
        reminderId: String,
        hhmm: String,
    ): Int = baseCode(reminderId, hhmm) * 8 + 1

    /** First of the three consecutive codes the notification's action buttons use. */
    fun actionRequestCodeBase(
        reminderId: String,
        hhmm: String,
    ): Int = baseCode(reminderId, hhmm) * 8 + 2

    fun notificationId(
        reminderId: String,
        hhmm: String,
    ): Int = baseCode(reminderId, hhmm) * 8 + 5

    // Masked to 28 bits so the *8 spread below can't overflow into a negative code.
    private fun baseCode(
        reminderId: String,
        hhmm: String,
    ): Int = slotKey(reminderId, hhmm).hashCode() and 0x0FFF_FFFF

    /** The `"reminder:"` prefix is what keeps this namespace apart from
     * [SupplementReminderScheduler.slotKey], even for the same id and time. */
    fun slotKey(
        reminderId: String,
        hhmm: String,
    ): String = "reminder:$reminderId|$hhmm"

    private fun splitSlot(slot: String): Pair<String, String>? {
        val body = slot.removePrefix("reminder:").takeIf { slot.startsWith("reminder:") } ?: return null
        val index = body.lastIndexOf('|')
        if (index <= 0 || index == body.length - 1) return null
        return body.substring(0, index) to body.substring(index + 1)
    }
}
