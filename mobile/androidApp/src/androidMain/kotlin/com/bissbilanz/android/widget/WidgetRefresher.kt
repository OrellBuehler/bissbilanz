package com.bissbilanz.android.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.todayIn
import java.util.concurrent.TimeUnit
import kotlin.time.Clock

object WidgetRefresher {
    /** Every home-screen widget that draws user data or depends on the day. */
    suspend fun refreshAll(context: Context) {
        // One at a time, so a widget that fails to load does not leave the rest stale.
        listOf<suspend (Context) -> Unit>(
            MacroWidget::updateAllWidgets,
            DayOverviewWidget::updateAllWidgets,
            QuickAddWidget::updateAllWidgets,
            FavoritesWidget::updateAllWidgets,
            QuickWeightWidget::updateAllWidgets,
        ).forEach { update ->
            try {
                update(context)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                org.koin.java.KoinJavaComponent
                    .getKoin()
                    .get<ErrorReporter>()
                    .captureException(e)
            }
        }
    }
}

/**
 * Redraws every widget just after local midnight, so "today" rolls over on the home
 * screen instead of showing yesterday's totals until the next periodic refresh. One
 * deferrable job per day rather than an exact alarm: a minute's lateness is harmless.
 * Each run queues the next one behind itself.
 */
class WidgetRolloverWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        WidgetRefresher.refreshAll(applicationContext)
        enqueue(applicationContext, ExistingWorkPolicy.APPEND_OR_REPLACE, nextMidnightDelayMs())
        return Result.success()
    }

    companion object {
        private const val UNIQUE_NAME = "widget_midnight_rollover"
        private const val SLACK_MS = 60_000L
        private const val DEBOUNCE_MS = 2_000L

        /** Arms the next rollover unless one is already pending. Called on every app start. */
        fun schedule(context: Context) = enqueue(context, ExistingWorkPolicy.KEEP, nextMidnightDelayMs())

        /**
         * The clock, the zone or the language moved: redraw, then re-arm against the new
         * midnight. The short delay lets REPLACE fold a burst (TIME_SET with
         * TIMEZONE_CHANGED, a language change seen by the receiver and the app) into
         * one redraw.
         */
        fun runNow(context: Context) = enqueue(context, ExistingWorkPolicy.REPLACE, DEBOUNCE_MS)

        private fun enqueue(
            context: Context,
            policy: ExistingWorkPolicy,
            delayMs: Long,
        ) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_NAME,
                policy,
                OneTimeWorkRequestBuilder<WidgetRolloverWorker>()
                    .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                    .build(),
            )
        }

        private fun nextMidnightDelayMs(): Long {
            val zone = TimeZone.currentSystemDefault()
            val now = Clock.System.now()
            val midnight =
                Clock.System
                    .todayIn(zone)
                    .plus(1, DateTimeUnit.DAY)
                    .atStartOfDayIn(zone)
            return (midnight - now).inWholeMilliseconds.coerceAtLeast(0L) + SLACK_MS
        }
    }
}

/**
 * TIME_SET and TIMEZONE_CHANGED move what "today" means; LOCALE_CHANGED changes the
 * language every widget label is drawn in. All three are exempt from the
 * implicit-broadcast ban, so this works from the manifest without a running process.
 * ACTION_DATE_CHANGED is not exempt; [WidgetRolloverWorker] covers midnight instead.
 */
class WidgetClockReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        when (intent.action) {
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_LOCALE_CHANGED,
            -> WidgetRolloverWorker.runNow(context)
        }
    }
}
