package com.bissbilanz.android.images

import android.content.Context
import com.bissbilanz.api.BissbilanzApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Turns a stored `imageUrl` into something Coil can load, cache-first.
 *
 * The apps are local-first, so "renders when online" isn't enough: a
 * server-hosted image is downloaded once into [LocalImageStore] and served from
 * there afterwards, which is what makes it survive airplane mode — and what
 * makes an account downgrade keep a real file rather than a URL that dies with
 * the account.
 */
class FoodImageResolver(
    private val context: Context,
    private val api: BissbilanzApi,
    private val baseUrl: String,
) {
    private val downloads = mutableMapOf<String, Mutex>()
    private val downloadsLock = Mutex()

    /**
     * Model for [coil.compose.AsyncImage]: a [File] for anything on device, the
     * absolute URL otherwise. Returns null when there is nothing to show.
     */
    suspend fun resolve(imageUrl: String?): Any? {
        if (imageUrl.isNullOrBlank()) return null

        // Locally-attached (Local mode) or localized (downgrade) photos.
        if (imageUrl.startsWith("file://")) return LocalImageStore.fileFor(context, imageUrl)

        // Public product images (Open Food Facts) — no token, no local copy.
        if (!imageUrl.startsWith("/")) return imageUrl

        LocalImageStore.cachedFile(context, imageUrl)?.let { return it }
        return cache(imageUrl) ?: "$baseUrl$imageUrl"
    }

    private suspend fun cache(imageUrl: String): File? {
        val key = LocalImageStore.cacheKey(imageUrl) ?: return null
        // One download per image: a list and a detail screen showing the same
        // food would otherwise race to write the same file.
        val mutex = downloadsLock.withLock { downloads.getOrPut(key) { Mutex() } }
        return mutex.withLock {
            LocalImageStore.cachedFile(context, imageUrl) ?: download(imageUrl, key)
        }
    }

    private suspend fun download(
        imageUrl: String,
        key: String,
    ): File? =
        try {
            val bytes = api.downloadFile(imageUrl)
            withContext(Dispatchers.IO) { LocalImageStore.write(context, key, bytes) }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            // Offline, or the image is gone — fall back to the network URL.
            null
        }
}
