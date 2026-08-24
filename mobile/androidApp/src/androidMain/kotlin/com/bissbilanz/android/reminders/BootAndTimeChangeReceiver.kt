package com.bissbilanz.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms reminders after the events that silently drop pending alarms or move what
 * "08:00" means:
 *
 * - BOOT_COMPLETED / MY_PACKAGE_REPLACED — the system clears all alarms
 * - TIMEZONE_CHANGED / TIME_SET — reminder times are wall-clock, so 08:00 must be
 *   re-resolved against the new zone or the corrected clock
 *
 * These actions are exempt from the implicit-broadcast ban, so a manifest receiver still
 * works without a running process.
 */
class BootAndTimeChangeReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            -> RescheduleRemindersWorker.enqueue(context)
        }
    }
}
