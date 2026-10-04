package com.bissbilanz.android.images

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.util.Base64
import com.bissbilanz.foodpackage.PackageImageStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Food-package photos on the device, kept in [LocalImageStore] like every other Local-mode
 * image: `file://` URLs, one copy per row, evicted when the row goes.
 */
class AndroidPackageImageStore(
    private val context: Context,
) : PackageImageStore {
    override suspend fun read(imageUrl: String): ByteArray? =
        withContext(Dispatchers.IO) {
            LocalImageStore.fileFor(context, imageUrl)?.takeIf { it.isFile }?.readBytes()
        }

    override suspend fun size(imageUrl: String): Long? =
        withContext(Dispatchers.IO) {
            LocalImageStore.fileFor(context, imageUrl)?.takeIf { it.isFile }?.length()
        }

    override suspend fun thumbnail(bytes: ByteArray): String? =
        withContext(Dispatchers.Default) {
            val bounds = boundsOf(bytes) ?: return@withContext null
            val options =
                BitmapFactory.Options().apply {
                    inSampleSize = sampleSizeFor(bounds.first, bounds.second, THUMBNAIL_PX)
                }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return@withContext null
            // JPEG has no alpha: a cut-out photo would come out black, so it is flattened onto white.
            val flat = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
            Canvas(flat).apply {
                drawColor(Color.WHITE)
                drawBitmap(bitmap, 0f, 0f, null)
            }
            bitmap.recycle()
            val out = ByteArrayOutputStream()
            flat.compress(Bitmap.CompressFormat.JPEG, THUMBNAIL_QUALITY, out)
            flat.recycle()
            "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }

    /**
     * The original bytes are kept as they are, under a fresh name. They are only checked to be a
     * decodable image of a sane size first, since a package can come from anyone.
     */
    @OptIn(ExperimentalUuidApi::class)
    override suspend fun saveImported(bytes: ByteArray): String? =
        withContext(Dispatchers.IO) {
            val extension = extensionOf(bytes) ?: return@withContext null
            val bounds = boundsOf(bytes) ?: return@withContext null
            if (bounds.first.toLong() * bounds.second > MAX_PIXELS) return@withContext null
            val file = LocalImageStore.write(context, "local-${Uuid.random()}.$extension", bytes)
            LocalImageStore.fileUri(file)
        }

    override suspend fun discard(imageUrl: String) {
        withContext(Dispatchers.IO) { LocalImageStore.evict(context, imageUrl) }
    }

    private fun boundsOf(bytes: ByteArray): Pair<Int, Int>? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        return if (options.outWidth > 0 && options.outHeight > 0) options.outWidth to options.outHeight else null
    }

    private fun sampleSizeFor(
        width: Int,
        height: Int,
        target: Int,
    ): Int {
        var sample = 1
        while (width / (sample * 2) >= target && height / (sample * 2) >= target) sample *= 2
        return sample
    }

    private fun extensionOf(bytes: ByteArray): String? =
        when {
            bytes.size >= 12 &&
                String(
                    bytes,
                    0,
                    4,
                    Charsets.US_ASCII,
                ) == "RIFF" &&
                String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP" -> "webp"
            bytes.size >= 4 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() -> "png"
            bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() -> "jpg"
            else -> null
        }

    private companion object {
        const val THUMBNAIL_PX = 96
        const val THUMBNAIL_QUALITY = 70

        /** A photo of 25 megapixels or more is not a food photo; refuse it rather than decode it later. */
        const val MAX_PIXELS = 25_000_000L
    }
}
