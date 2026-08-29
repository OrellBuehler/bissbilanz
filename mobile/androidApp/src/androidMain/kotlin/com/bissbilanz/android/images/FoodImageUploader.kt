package com.bissbilanz.android.images

import android.content.Context
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.mode.AppModeManager
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Puts a freshly cropped photo somewhere a food can point at, and returns the
 * URL to store on the row.
 *
 * In Local mode there is no server, so the JPEG is written into
 * [LocalImageStore] and referenced by a `file://` URL — the same shape the
 * account downgrade produces, which is what lets `LocalDataMigrator` re-upload
 * it if the user later signs in.
 */
class FoodImageUploader(
    private val context: Context,
    private val api: BissbilanzApi,
    private val appModeManager: AppModeManager,
) {
    @OptIn(ExperimentalUuidApi::class)
    suspend fun store(jpeg: ByteArray): String {
        if (appModeManager.isLocal) {
            val file = LocalImageStore.write(context, "local-${Uuid.random()}.jpg", jpeg)
            return LocalImageStore.fileUri(file)
        }
        val imageUrl = api.uploadImage("food.jpg", jpeg, contentType = "image/jpeg")
        // Seed the cache with the bytes we already hold, so the new image renders
        // immediately instead of after a round trip — and offline right away.
        LocalImageStore.cacheKey(imageUrl)?.let { LocalImageStore.write(context, it, jpeg) }
        return imageUrl
    }
}
