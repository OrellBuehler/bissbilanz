package com.bissbilanz.android.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class QuickWeightWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = QuickWeightWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        val work =
            PeriodicWorkRequestBuilder<QuickWeightWidgetWorker>(
                30,
                TimeUnit.MINUTES,
                15,
                TimeUnit.MINUTES,
            ).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            work,
        )
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    companion object {
        const val WORK_NAME = "weight_widget_refresh"
    }
}
