package com.bissbilanz.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.repository.WeightRepository
import io.sentry.Sentry

class QuickWeightWidgetWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()

        try {
            koin.get<WeightRepository>().refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Sentry.captureException(e)
        }

        QuickWeightWidget.updateAllWidgets(applicationContext)
        return Result.success()
    }
}
