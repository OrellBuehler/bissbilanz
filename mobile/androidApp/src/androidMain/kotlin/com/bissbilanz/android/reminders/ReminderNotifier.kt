package com.bissbilanz.android.reminders

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.Reminder

/**
 * Posts a due logging-reminder notification with its snooze/skip actions.
 *
 * Its own channel, separate from [SupplementReminderNotifier.CHANNEL_ID], so someone can
 * mute one kind of reminder without losing the other. The group summary id (4400) is well
 * clear of the supplement reminders' (4300) and fasting's (4201).
 */
object ReminderNotifier {
    const val CHANNEL_ID = "logging_reminders"
    const val GROUP_KEY = "com.bissbilanz.android.LOGGING_REMINDERS"

    private const val SUMMARY_NOTIFICATION_ID = 4400

    // The POST_NOTIFICATIONS guard is the `hasPermission` early return below;
    // lint cannot follow it through the helper, hence the suppression.
    @SuppressLint("MissingPermission")
    fun show(
        context: Context,
        reminder: Reminder,
        notificationId: Int,
        actionRequestCodeBase: Int,
        hhmm: String,
        occurrenceDate: String,
    ) {
        if (!hasPermission(context)) return
        ensureChannel(context)

        val (title, route) = contentFor(context, reminder)

        val notification =
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_reminder)
                .setContentTitle(title)
                .setContentText(hhmm)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setGroup(GROUP_KEY)
                .setContentIntent(openRouteIntent(context, route, notificationId))
                .addAction(
                    0,
                    context.getString(R.string.reminder_action_snooze),
                    actionIntent(
                        context,
                        ReminderActionReceiver.ACTION_SNOOZE,
                        reminder.id,
                        hhmm,
                        notificationId,
                        actionRequestCodeBase,
                        occurrenceDate,
                    ),
                ).addAction(
                    0,
                    context.getString(R.string.reminder_action_skip),
                    actionIntent(
                        context,
                        ReminderActionReceiver.ACTION_SKIP,
                        reminder.id,
                        hhmm,
                        notificationId,
                        actionRequestCodeBase + 1,
                        occurrenceDate,
                    ),
                ).build()

        val manager = NotificationManagerCompat.from(context)
        manager.notify(notificationId, notification)
        // Several reminders can come due at the same minute; the summary keeps them
        // collapsed into one row instead of flooding the shade.
        manager.notify(SUMMARY_NOTIFICATION_ID, summaryNotification(context))
    }

    fun clear(
        context: Context,
        notificationId: Int,
    ) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(notificationId)
        // Android leaves an orphaned summary behind once the last child is gone.
        val stillShowing =
            manager.activeNotifications.any {
                it.id != SUMMARY_NOTIFICATION_ID && it.notification.group == GROUP_KEY
            }
        if (!stillShowing) manager.cancel(SUMMARY_NOTIFICATION_ID)
    }

    /** The notification's body text and which screen tapping it should open. */
    private fun contentFor(
        context: Context,
        reminder: Reminder,
    ): Pair<String, String> =
        when (reminder.kind) {
            Reminder.Kind.weight -> context.getString(R.string.reminder_notification_weight) to "weight"
            Reminder.Kind.sleep -> context.getString(R.string.reminder_notification_sleep) to "sleep"
            Reminder.Kind.meal -> {
                val mealType = reminder.mealType.orEmpty()
                context.getString(R.string.reminder_notification_meal, mealType) to "dashboard"
            }
        }

    private fun summaryNotification(context: Context) =
        NotificationCompat
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(context.getString(R.string.reminder_notification_summary))
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setContentIntent(openRouteIntent(context, "dashboard", SUMMARY_NOTIFICATION_ID))
            .build()

    // Both intents name their component and both PendingIntents are immutable, matching
    // SupplementReminderNotifier — see its comment for why the target is spelled out via
    // setClassName/setPackage rather than relying on `X::class.java` alone.
    private fun openRouteIntent(
        context: Context,
        route: String,
        requestCode: Int,
    ): PendingIntent {
        val openIntent = Intent(context, MainActivity::class.java)
        openIntent.setClassName(context, MainActivity::class.java.name)
        openIntent.setPackage(context.packageName)
        openIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        openIntent.putExtra(MainActivity.EXTRA_NAVIGATE_TO, route)
        return PendingIntent.getActivity(
            context,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun actionIntent(
        context: Context,
        action: String,
        reminderId: String,
        hhmm: String,
        notificationId: Int,
        requestCode: Int,
        occurrenceDate: String,
    ): PendingIntent {
        val intent = Intent(context, ReminderActionReceiver::class.java)
        intent.setClassName(context, ReminderActionReceiver::class.java.name)
        intent.setPackage(context.packageName)
        intent.action = action
        intent.putExtra(ReminderActionReceiver.EXTRA_REMINDER_ID, reminderId)
        intent.putExtra(ReminderActionReceiver.EXTRA_TIME, hhmm)
        intent.putExtra(ReminderActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
        intent.putExtra(ReminderActionReceiver.EXTRA_DATE, occurrenceDate)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * POST_NOTIFICATIONS is runtime-granted from API 33. Without it the reminder still
     * saves and syncs — only the delivery is missing — so callers ignore the result.
     */
    fun hasPermission(context: Context): Boolean =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.reminder_notification_channel),
                // A reminder should make a sound but not seize the screen; IMPORTANCE_HIGH
                // would heads-up over whatever the user is doing.
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.reminder_notification_channel_desc)
                setShowBadge(true)
            },
        )
    }
}
