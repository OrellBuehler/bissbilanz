package com.bissbilanz.android.sync

import android.content.Context
import com.bissbilanz.android.images.LocalImageStore
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.migration.LocalDataMigrator

/**
 * Downloads a server-hosted photo into app-private storage during the
 * account downgrade so it survives the server-side deletion. Returns a
 * `file://` URI, which the image loaders pass straight to Coil (only
 * server-relative `/`-prefixed URLs get the base URL prepended).
 *
 * Writes into the same [LocalImageStore] directory the offline image cache
 * uses, so an image already viewed is localized without a second download.
 */
class AndroidPhotoLocalizer(
    private val context: Context,
    private val api: BissbilanzApi,
) : AccountDowngrader.PhotoLocalizer {
    override suspend fun localize(imageUrl: String): String? =
        try {
            val name = imageUrl.substringAfterLast('/')
            val cached = LocalImageStore.cachedFile(context, imageUrl)
            val file = cached ?: LocalImageStore.write(context, name, api.downloadFile(imageUrl))
            LocalImageStore.fileUri(file)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            // A missing photo shouldn't block the downgrade — keep the original URL
            null
        }
}

/**
 * The read side of [AndroidPhotoLocalizer]: hands a localized photo back to the
 * migration so it can be re-uploaded when the user moves the data into an
 * account again. Confined to the localizer's own directory — a local row must
 * never be able to turn the migration into a reader of arbitrary app files.
 */
class AndroidLocalPhotoReader(
    private val context: Context,
) : LocalDataMigrator.LocalPhotoReader {
    override suspend fun read(imageUrl: String): Pair<String, ByteArray>? {
        val file = LocalImageStore.fileFor(context, imageUrl)?.takeIf { it.isFile } ?: return null
        return try {
            file.name to file.readBytes()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }
    }
}
