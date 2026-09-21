package com.bissbilanz.android.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.serialization.json.Json

class FavoritesWidgetWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val errorReporter = koin.get<ErrorReporter>()
        val foodRepo = koin.get<FoodRepository>()
        val prefsRepo = koin.get<PreferencesRepository>()

        try {
            foodRepo.refreshFavorites()
            prefsRepo.refresh()
            WidgetFoodImages.sync(applicationContext, koin.get<BissbilanzApi>(), koin.get<UserDataDatabase>(), koin.get<Json>())
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }

        FavoritesWidget.updateAllWidgets(applicationContext)
        return Result.success()
    }
}
