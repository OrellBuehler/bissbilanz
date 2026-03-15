package com.bissbilanz.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class MacroWidgetWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

        try {
            koin.get<EntryRepository>().refresh(today)
            koin.get<GoalsRepository>().refresh()
        } catch (_: Exception) {
            // Widget will show cached data
        }

        MacroWidget.updateAllWidgets(applicationContext)
        return Result.success()
    }
}
