package com.bissbilanz.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

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
        val db = koin.get<BissbilanzDatabase>()
        val json = koin.get<Json>()

        try {
            foodRepo.refreshFavorites()
            prefsRepo.refresh()

            val favorites =
                db.bissbilanzDatabaseQueries
                    .selectFavorites()
                    .executeAsList()
                    .mapNotNull { json.decodeOrNull<Food>(it.jsonData) }

            val density = applicationContext.resources.displayMetrics.density
            val tilePx = (56 * density).toInt()
            val imageDir = File(applicationContext.cacheDir, "widget_food_images").also { it.mkdirs() }
            val favoriteIds = favorites.map { it.id }.toSet()

            imageDir.listFiles()?.forEach { file ->
                val id = file.nameWithoutExtension
                if (id !in favoriteIds) file.delete()
            }

            favorites.forEach { food ->
                val imageUrl = food.imageUrl ?: return@forEach
                val file = File(imageDir, "${food.id}.png")
                val ageMs = System.currentTimeMillis() - file.lastModified()
                if (file.exists() && ageMs < 24 * 60 * 60 * 1000L) return@forEach

                val conn = URL(imageUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 10000
                try {
                    if (conn.responseCode != HttpURLConnection.HTTP_OK) return@forEach
                    val bitmap = conn.inputStream.use { BitmapFactory.decodeStream(it) } ?: return@forEach
                    val scaled = Bitmap.createScaledBitmap(bitmap, tilePx, tilePx, true)
                    FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.PNG, 90, it) }
                    if (scaled !== bitmap) bitmap.recycle()
                    scaled.recycle()
                } finally {
                    conn.disconnect()
                }
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }

        FavoritesWidget.updateAllWidgets(applicationContext)
        return Result.success()
    }
}
