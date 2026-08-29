package com.bissbilanz.android.sync

import android.content.Context
import android.net.Uri
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.migration.AccountDowngrader
import com.bissbilanz.migration.LocalDataMigrator
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
            val file = File(localImageDir(context), imageUrl.substringAfterLast('/'))
            file.writeBytes(bytes)
            Uri.fromFile(file).toString()
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
        val path = Uri.parse(imageUrl).takeIf { it.scheme == "file" }?.path ?: return null
        val file = File(path).canonicalFile
        val dir = localImageDir(context).canonicalFile
        if (file.parentFile != dir || !file.isFile) return null
        return try {
            file.name to file.readBytes()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }
    }
}

private fun localImageDir(context: Context): File = File(context.filesDir, "local-images").apply { mkdirs() }
