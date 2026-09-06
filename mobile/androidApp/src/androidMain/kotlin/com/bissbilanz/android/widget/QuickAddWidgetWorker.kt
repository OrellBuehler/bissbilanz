package com.bissbilanz.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.PreferencesRepository
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class QuickAddWidgetWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val errorReporter = koin.get<ErrorReporter>()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

        try {
            // The rows come out of the cached entry log, and the one-tap log needs the
            // meal timeframes off the preferences to pick a meal without asking.
            koin.get<EntryRepository>().refresh(today)
            koin.get<PreferencesRepository>().refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }

        QuickAddWidget.updateAllWidgets(applicationContext)
        FoodShortcutPublisher.publish(applicationContext)
        return Result.success()
    }
}
