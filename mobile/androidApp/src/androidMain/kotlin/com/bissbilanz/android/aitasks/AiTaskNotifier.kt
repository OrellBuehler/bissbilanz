package com.bissbilanz.android.aitasks

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
import com.bissbilanz.api.generated.model.AiTask

/**
 * Tells the user the assistant gave up on a meal they sent it.
 *
 * A dismissal is the only AI task outcome worth interrupting for: a completion speaks
 * for itself as new diary entries, whereas a dismissal means the meal was never logged
 * and the user has to do something about it. Its own low-key channel so it can be muted
 * without losing supplement reminders.
 */
object AiTaskNotifier {
    const val CHANNEL_ID = "ai_tasks"
    const val GROUP_KEY = "com.bissbilanz.android.AI_TASKS"

    /** Clear of FastingNotifier's 4201 and the supplement summary's 4300. */
    private const val SUMMARY_NOTIFICATION_ID = 4400

    // The POST_NOTIFICATIONS guard is the `hasPermission` early return below;
    // lint cannot follow it through the helper, hence the suppression.
    @SuppressLint("MissingPermission")
    fun showDismissed(
        context: Context,
        tasks: List<AiTask>,
    ) {
        if (tasks.isEmpty() || !hasPermission(context)) return
        ensureChannel(context)

        val manager = NotificationManagerCompat.from(context)
        for (task in tasks) {
            val body =
                task.resultSummary?.takeIf { it.isNotBlank() }
                    ?: context.getString(R.string.ai_tasks_notification_body_fallback)
            val notification =
                NotificationCompat
                    .Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_ai_task)
                    .setContentTitle(context.getString(R.string.ai_tasks_notification_title))
                    .setContentText(body)
                    // The assistant's reason is prose and routinely longer than one line.
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setCategory(NotificationCompat.CATEGORY_STATUS)
                    .setGroup(GROUP_KEY)
                    .setContentIntent(openAiTasksIntent(context, notificationId(task.id)))
                    .build()
            manager.notify(notificationId(task.id), notification)
        }
        // Several tasks can be dismissed in one assistant session; the summary keeps
        // them collapsed into one row instead of flooding the shade.
        manager.notify(SUMMARY_NOTIFICATION_ID, summaryNotification(context))
    }

    fun notificationId(taskId: String): Int = taskId.hashCode() and 0x0FFF_FFFF

    private fun summaryNotification(context: Context) =
        NotificationCompat
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ai_task)
            .setContentTitle(context.getString(R.string.ai_tasks_notification_summary))
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setContentIntent(openAiTasksIntent(context, SUMMARY_NOTIFICATION_ID))
            .build()

    // Named component plus an immutable PendingIntent, so this is not the implicit,
    // mutable PendingIntent CodeQL's implicit-pendingintents query looks for. It does
    // not read Kotlin's `X::class.java` as an explicit target, so the target is also
    // spelled out through setClassName/setPackage on a plain local.
    private fun openAiTasksIntent(
        context: Context,
        requestCode: Int,
    ): PendingIntent {
        val openIntent = Intent(context, MainActivity::class.java)
        openIntent.setClassName(context, MainActivity::class.java.name)
        openIntent.setPackage(context.packageName)
        openIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        openIntent.putExtra(MainActivity.EXTRA_NAVIGATE_TO, "ai-tasks")
        return PendingIntent.getActivity(
            context,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * POST_NOTIFICATIONS is runtime-granted from API 33. Without it the unread state
     * still shows in the AI Tasks list — only the notification is missing — so callers
     * ignore the result.
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
                context.getString(R.string.ai_tasks_notification_channel),
                // Worth a sound — the meal did not get logged — but not worth taking
                // over the screen, which IMPORTANCE_HIGH would do.
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.ai_tasks_notification_channel_desc)
                setShowBadge(true)
            },
        )
    }
}
