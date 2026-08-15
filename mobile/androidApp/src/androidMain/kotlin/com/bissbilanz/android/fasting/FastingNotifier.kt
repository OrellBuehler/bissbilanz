package com.bissbilanz.android.fasting

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

/**
 * The ongoing "fast in progress" notification — Android's stand-in for the iOS
 * Live Activity. Uses a chronometer so the elapsed time ticks without the app
 * posting updates, and carries an End Fast action handled by [EndFastReceiver].
 */
object FastingNotifier {
    const val CHANNEL_ID = "fasting"
    const val NOTIFICATION_ID = 4201

    // The POST_NOTIFICATIONS guard is the `hasPermission` early return below;
    // lint cannot follow it through the helper, hence the suppression.
    @SuppressLint("MissingPermission")
    fun show(
        context: Context,
        session: FastingSession,
    ) {
        if (!hasPermission(context)) return
        ensureChannel(context)

        val openApp =
            PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra(MainActivity.EXTRA_NAVIGATE_TO, "fasting")
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val endFast =
            PendingIntent.getBroadcast(
                context,
                1,
                Intent(context, EndFastReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val notification =
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_fasting)
                .setContentTitle(context.getString(R.string.fasting_notification_title))
                .setContentText(
                    context.getString(R.string.fasting_of_target_hours, session.targetHours),
                )
                // The system ticks the chronometer itself, so a 16h fast needs no
                // periodic re-posts to stay accurate.
                .setUsesChronometer(true)
                .setWhen(session.startedAtEpochMs)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setContentIntent(openApp)
                .addAction(0, context.getString(R.string.fasting_end), endFast)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    fun clear(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    /**
     * POST_NOTIFICATIONS is runtime-granted from API 33. Without it the fast still
     * runs — only the lock-screen surface is missing — so callers ignore the result.
     */
    private fun hasPermission(context: Context): Boolean =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.fasting_notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.fasting_notification_channel_desc)
                setShowBadge(false)
            },
        )
    }
}
