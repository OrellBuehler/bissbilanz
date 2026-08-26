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
import com.bissbilanz.model.Supplement

/**
 * Posts a due-supplement reminder with its three inline actions.
 *
 * Its own channel rather than the fasting one: fasting is a silent IMPORTANCE_LOW
 * ongoing notification, a reminder has to actually alert, and separate channels let
 * someone mute reminders without losing the fasting surface.
 */
object SupplementReminderNotifier {
    const val CHANNEL_ID = "supplement_reminders"
    const val GROUP_KEY = "com.bissbilanz.android.SUPPLEMENT_REMINDERS"

    /** Well clear of FastingNotifier's 4201. */
    private const val SUMMARY_NOTIFICATION_ID = 4300

    // The POST_NOTIFICATIONS guard is the `hasPermission` early return below;
    // lint cannot follow it through the helper, hence the suppression.
    @SuppressLint("MissingPermission")
    fun show(
        context: Context,
        supplement: Supplement,
        notificationId: Int,
        actionRequestCodeBase: Int,
        hhmm: String,
        occurrenceDate: String,
    ) {
        if (!hasPermission(context)) return
        ensureChannel(context)

        val notification =
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_supplement)
                .setContentTitle(context.getString(R.string.supplement_reminder_title, supplement.name))
                .setContentText(ingredientSummary(supplement))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setGroup(GROUP_KEY)
                .setContentIntent(openSupplementsIntent(context, notificationId))
                .addAction(
                    0,
                    context.getString(R.string.supplement_reminder_action_taken),
                    actionIntent(
                        context,
                        SupplementReminderActionReceiver.ACTION_TAKEN,
                        supplement.id,
                        hhmm,
                        notificationId,
                        actionRequestCodeBase,
                        occurrenceDate,
                    ),
                ).addAction(
                    0,
                    context.getString(R.string.supplement_reminder_action_snooze),
                    actionIntent(
                        context,
                        SupplementReminderActionReceiver.ACTION_SNOOZE,
                        supplement.id,
                        hhmm,
                        notificationId,
                        actionRequestCodeBase + 1,
                        occurrenceDate,
                    ),
                ).addAction(
                    0,
                    context.getString(R.string.supplement_reminder_action_skip),
                    actionIntent(
                        context,
                        SupplementReminderActionReceiver.ACTION_SKIP,
                        supplement.id,
                        hhmm,
                        notificationId,
                        actionRequestCodeBase + 2,
                        occurrenceDate,
                    ),
                ).build()

        val manager = NotificationManagerCompat.from(context)
        manager.notify(notificationId, notification)
        // Several supplements can come due at the same minute; the summary keeps them
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

    private fun ingredientSummary(supplement: Supplement): String = supplement.ingredients.joinToString(", ") { it.food.name }

    private fun summaryNotification(context: Context) =
        NotificationCompat
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_supplement)
            .setContentTitle(context.getString(R.string.supplement_reminder_summary))
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setContentIntent(openSupplementsIntent(context, SUMMARY_NOTIFICATION_ID))
            .build()

    // Both intents name their component and both PendingIntents are immutable, so
    // neither is the implicit, mutable PendingIntent CodeQL's implicit-pendingintents
    // query looks for. It does not read Kotlin's `X::class.java` as an explicit target,
    // so the target is also spelled out through setClassName/setPackage on a plain
    // local — inside `apply {}` the query does not associate the calls with the intent.
    private fun openSupplementsIntent(
        context: Context,
        requestCode: Int,
    ): PendingIntent {
        val openIntent = Intent(context, MainActivity::class.java)
        openIntent.setClassName(context, MainActivity::class.java.name)
        openIntent.setPackage(context.packageName)
        openIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        openIntent.putExtra(MainActivity.EXTRA_NAVIGATE_TO, "supplements")
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
        supplementId: String,
        hhmm: String,
        notificationId: Int,
        requestCode: Int,
        occurrenceDate: String,
    ): PendingIntent {
        val intent = Intent(context, SupplementReminderActionReceiver::class.java)
        intent.setClassName(context, SupplementReminderActionReceiver::class.java.name)
        intent.setPackage(context.packageName)
        intent.action = action
        intent.putExtra(SupplementReminderActionReceiver.EXTRA_SUPPLEMENT_ID, supplementId)
        intent.putExtra(SupplementReminderActionReceiver.EXTRA_TIME, hhmm)
        intent.putExtra(SupplementReminderActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
        intent.putExtra(SupplementReminderActionReceiver.EXTRA_DATE, occurrenceDate)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * POST_NOTIFICATIONS is runtime-granted from API 33. Without it the reminder times
     * still save and sync — only the delivery is missing — so callers ignore the result.
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
                context.getString(R.string.supplement_reminder_channel),
                // A twice-daily nudge should make a sound but not seize the screen;
                // IMPORTANCE_HIGH would heads-up over whatever the user is doing.
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.supplement_reminder_channel_desc)
                setShowBadge(true)
            },
        )
    }
}
