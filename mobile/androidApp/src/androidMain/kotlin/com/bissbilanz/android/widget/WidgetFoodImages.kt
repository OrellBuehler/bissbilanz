package com.bissbilanz.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.bissbilanz.android.images.LocalImageStore
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import kotlin.time.Clock

/**
 * The pre-scaled thumbnails the home-screen widgets draw.
 *
 * Glance can only hand the launcher a bitmap that is already on disk — a widget
 * cannot download or decode anything while it renders — so the workers prepare one
 * PNG per food here, at tile size, and the widgets only read them back.
 *
 * Both the favorites grid and the quick-add rows draw from this one directory, so
 * the whole set is prepared (and pruned) in one pass: a per-widget sweep would
 * delete the other widget's thumbnails on every run.
 */
internal object WidgetFoodImages {
    private const val DIR_NAME = "widget_food_images"
    private const val MAX_AGE_MS = 24 * 60 * 60 * 1000L

    /** A little over the favorites grid's 52dp tile; the quick-add rows scale it down. */
    private const val TILE_DP = 56

    fun directory(context: Context): File = File(context.cacheDir, DIR_NAME).apply { mkdirs() }

    fun cached(
        context: Context,
        foodId: String,
    ): File? = File(directory(context), "$foodId.png").takeIf { it.isFile }

    /**
     * Refreshes the thumbnails of every food either widget can show, and drops the
     * ones nothing references any more.
     */
    suspend fun sync(
        context: Context,
        api: BissbilanzApi,
        db: UserDataDatabase,
        json: Json,
    ) {
        val queries = db.userDataDatabaseQueries
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val ids =
            buildSet {
                queries.selectFavorites().executeAsList().mapTo(this) { it.id }
                RecentFoods.load(db, json, today, QUICK_ADD_MAX_ROWS).mapTo(this) { it.id }
            }
        val images =
            ids.associateWith { id ->
                queries
                    .selectFoodById(id)
                    .executeAsOneOrNull()
                    ?.let { json.decodeOrNull<Food>(it.jsonData) }
                    ?.imageUrl
            }
        withContext(Dispatchers.IO) { write(context, api, images) }
    }

    private suspend fun write(
        context: Context,
        api: BissbilanzApi,
        images: Map<String, String?>,
    ) {
        val dir = directory(context)
        dir.listFiles()?.forEach { file ->
            if (images[file.nameWithoutExtension] == null) file.delete()
        }

        val tilePx = (TILE_DP * context.resources.displayMetrics.density).toInt()
        images.forEach { (foodId, imageUrl) ->
            if (imageUrl == null) return@forEach
            val file = File(dir, "$foodId.png")
            if (file.isFile && System.currentTimeMillis() - file.lastModified() < MAX_AGE_MS) return@forEach
            val bytes = bytesFor(context, api, imageUrl) ?: return@forEach
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@forEach
            val scaled = Bitmap.createScaledBitmap(bitmap, tilePx, tilePx, true)
            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.PNG, 90, it) }
            if (scaled !== bitmap) bitmap.recycle()
            scaled.recycle()
        }
    }

    /**
     * On-device first. A Local-mode `file://` photo has no server to fetch it from,
     * and an already-cached upload is bytes we hold; only an image this device has
     * never seen is worth a request.
     */
    private suspend fun bytesFor(
        context: Context,
        api: BissbilanzApi,
        imageUrl: String,
    ): ByteArray? {
        LocalImageStore.fileFor(context, imageUrl)?.takeIf { it.isFile }?.let { file ->
            return runCatching { file.readBytes() }.getOrNull()
        }
        if (imageUrl.startsWith("file://")) return null
        return try {
            api.downloadBytes(imageUrl)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            null
        }
    }
}
