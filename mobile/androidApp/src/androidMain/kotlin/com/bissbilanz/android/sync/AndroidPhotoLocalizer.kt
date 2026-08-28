package com.bissbilanz.android.sync

import android.content.Context
import android.net.Uri
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.migration.AccountDowngrader
import java.io.File

/**
 * Downloads a server-hosted photo into app-private storage during the
 * account downgrade so it survives the server-side deletion. Returns a
 * `file://` URI, which the image loaders pass straight to Coil (only
 * server-relative `/`-prefixed URLs get the base URL prepended).
 */
class AndroidPhotoLocalizer(
    private val context: Context,
    private val api: BissbilanzApi,
) : AccountDowngrader.PhotoLocalizer {
    override suspend fun localize(imageUrl: String): String? =
        try {
            val bytes = api.downloadFile(imageUrl)
            val dir = File(context.filesDir, "local-images").apply { mkdirs() }
            val file = File(dir, imageUrl.substringAfterLast('/'))
            file.writeBytes(bytes)
            Uri.fromFile(file).toString()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            // A missing photo shouldn't block the downgrade — keep the original URL
            null
        }
}
