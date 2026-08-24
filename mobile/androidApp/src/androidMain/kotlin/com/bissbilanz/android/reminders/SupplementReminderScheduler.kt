package com.bissbilanz.android.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.bissbilanz.model.Supplement
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.util.SupplementSchedule
import kotlinx.coroutines.flow.first
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

/**
 * Arms one AlarmManager alarm per (supplement, reminder time), for that slot's next due
 * occurrence only; the receiver re-arms its own slot after firing.
 *
 * Uses `setAndAllowWhileIdle` rather than an exact alarm. Exact alarms need
 * SCHEDULE_EXACT_ALARM, which is denied by default at our targetSdk and would bounce the
 * user to a system settings page, and USE_EXACT_ALARM is restricted by Play policy to
 * alarm-clock and calendar apps — which this is not. Inexact costs us up to ~10 minutes
 * of drift while the phone is idle, which is fine for a supplement nudge and is stated in
 * the Settings copy.
 */
object SupplementReminderScheduler {
    /**
     * Cancels every armed alarm, then re-arms from the current supplement rows. Safe to
     * call repeatedly — callers funnel through [RescheduleRemindersWorker]'s unique work
     * so a burst (e.g. a sync refresh caching many supplements) collapses into one pass.
     */
    suspend fun rescheduleAll(
        context: Context,
        repository: SupplementRepository,
        preferences: SupplementReminderPreferences,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val zone = TimeZone.currentSystemDefault()
        val now = Clock.System.now().toLocalDateTime(zone)

        preferences.pruneSkips(now.date)

        // AlarmManager can't be enumerated, so the persisted registry is the only way to
        // reach an alarm whose supplement has since been deleted or deactivated.
        preferences.armed.forEach { slot ->
            val (supplementId, hhmm) = splitSlot(slot) ?: return@forEach
            cancel(context, alarmManager, supplementId, hhmm)
        }

        val supplements = repository.supplements().first()
        val armed = mutableSetOf<String>()
        for (supplement in supplements) {
            if (!supplement.isActive) continue
            for (hhmm in supplement.reminderTimes.orEmpty()) {
                val next = SupplementSchedule.nextOccurrence(supplement, hhmm, now) ?: continue
                arm(context, alarmManager, supplement.id, hhmm, next, zone)
                armed.add(slotKey(supplement.id, hhmm))
            }
        }
        preferences.armed = armed
    }

    /** Re-arms a single slot after it fired, without a full sweep. */
    fun armNext(
        context: Context,
        supplement: Supplement,
        hhmm: String,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val zone = TimeZone.currentSystemDefault()
        val now = Clock.System.now().toLocalDateTime(zone)
        val next = SupplementSchedule.nextOccurrence(supplement, hhmm, now) ?: return
        arm(context, alarmManager, supplement.id, hhmm, next, zone)
    }

    /** Schedules the snooze re-fire. Its own request code, so it can't cancel the daily alarm. */
    fun armSnooze(
        context: Context,
        supplementId: String,
        hhmm: String,
        delayMinutes: Int,
    ) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val triggerAt = System.currentTimeMillis() + delayMinutes * 60_000L
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            triggerAt,
            alarmPendingIntent(context, supplementId, hhmm, isSnooze = true),
        )
    }

    private fun arm(
        context: Context,
        alarmManager: AlarmManager,
        supplementId: String,
        hhmm: String,
        at: LocalDateTime,
        zone: TimeZone,
    ) {
        alarmManager.setAndAllowWhileIdle(
            // RTC_WAKEUP is wall-clock, so a corrected device clock or a timezone change
            // moves the alarm with it rather than firing at a stale elapsed offset.
            AlarmManager.RTC_WAKEUP,
            at.toInstant(zone).toEpochMilliseconds(),
            alarmPendingIntent(context, supplementId, hhmm, isSnooze = false),
        )
    }

    private fun cancel(
        context: Context,
        alarmManager: AlarmManager,
        supplementId: String,
        hhmm: String,
    ) {
        alarmManager.cancel(alarmPendingIntent(context, supplementId, hhmm, isSnooze = false))
        alarmManager.cancel(alarmPendingIntent(context, supplementId, hhmm, isSnooze = true))
    }

    // Explicit component + FLAG_IMMUTABLE, matching FastingNotifier: neither an implicit
    // nor a mutable PendingIntent, which is what CodeQL's query looks for. The component
    // is spelled out via setClassName/setPackage because the query does not read
    // `X::class.java` as an explicit target.
    private fun alarmPendingIntent(
        context: Context,
        supplementId: String,
        hhmm: String,
        isSnooze: Boolean,
    ): PendingIntent {
        val intent = Intent(context, SupplementReminderReceiver::class.java)
        intent.setClassName(context, SupplementReminderReceiver::class.java.name)
        intent.setPackage(context.packageName)
        intent.putExtra(SupplementReminderReceiver.EXTRA_SUPPLEMENT_ID, supplementId)
        intent.putExtra(SupplementReminderReceiver.EXTRA_TIME, hhmm)
        intent.putExtra(SupplementReminderReceiver.EXTRA_IS_SNOOZE, isSnooze)
        return PendingIntent.getBroadcast(
            context,
            if (isSnooze) snoozeRequestCode(supplementId, hhmm) else alarmRequestCode(supplementId, hhmm),
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
        supplementId: String,
        hhmm: String,
    ): Int = baseCode(supplementId, hhmm) * 8

    fun snoozeRequestCode(
        supplementId: String,
        hhmm: String,
    ): Int = baseCode(supplementId, hhmm) * 8 + 1

    /** First of the three consecutive codes the notification's action buttons use. */
    fun actionRequestCodeBase(
        supplementId: String,
        hhmm: String,
    ): Int = baseCode(supplementId, hhmm) * 8 + 2

    fun notificationId(
        supplementId: String,
        hhmm: String,
    ): Int = baseCode(supplementId, hhmm) * 8 + 5

    // Masked to 28 bits so the *8 spread below can't overflow into a negative code.
    private fun baseCode(
        supplementId: String,
        hhmm: String,
    ): Int = slotKey(supplementId, hhmm).hashCode() and 0x0FFF_FFFF

    fun slotKey(
        supplementId: String,
        hhmm: String,
    ): String = "$supplementId|$hhmm"

    private fun splitSlot(slot: String): Pair<String, String>? {
        val index = slot.lastIndexOf('|')
        if (index <= 0 || index == slot.length - 1) return null
        return slot.substring(0, index) to slot.substring(index + 1)
    }
}
