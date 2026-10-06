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
import java.io.File
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

    /**
     * A bulk package's photos are 400 px webp files the exporter wrote itself: when the header
     * says so, they are kept as they are without being decoded, which is what keeps tens of
     * thousands of them fast. Anything else goes through the usual checks.
     */
    @OptIn(ExperimentalUuidApi::class)
    override suspend fun saveImportedBulk(bytes: ByteArray): String? =
        withContext(Dispatchers.IO) {
            val extension = extensionOf(bytes) ?: return@withContext null
            val size = if (extension == "webp") webpDimensions(bytes) else null
            val trusted = size != null && size.first <= BULK_TRUSTED_PX && size.second <= BULK_TRUSTED_PX
            if (!trusted) {
                val bounds = boundsOf(bytes) ?: return@withContext null
                if (bounds.first.toLong() * bounds.second > MAX_PIXELS) return@withContext null
            }
            val file = LocalImageStore.writeSharded(context, "${Uuid.random()}.$extension", bytes)
            LocalImageStore.fileUri(file)
        }

    /** The photo as the bulk endpoint accepts it: at most [maxBytes], re-encoded smaller when it has to be. */
    override suspend fun readForUpload(
        imageUrl: String,
        maxBytes: Int,
    ): ByteArray? =
        withContext(Dispatchers.IO) {
            val bytes = LocalImageStore.fileFor(context, imageUrl)?.takeIf { it.isFile }?.readBytes() ?: return@withContext null
            if (bytes.size <= maxBytes) bytes else shrink(bytes, maxBytes)
        }

    /**
     * The server renders its own thumbnail of what it receives, so the local copy of an
     * uploaded photo becomes the cache entry for the hosted one instead of being downloaded again.
     */
    override suspend fun adoptUploaded(
        localUrl: String,
        serverUrl: String,
    ) {
        withContext(Dispatchers.IO) {
            val source = LocalImageStore.fileFor(context, localUrl)?.takeIf { it.isFile } ?: return@withContext
            val key = LocalImageStore.cacheKey(serverUrl)
            if (key == null) {
                LocalImageStore.evict(context, localUrl)
                return@withContext
            }
            val target = File(LocalImageStore.directory(context), key)
            if (!source.renameTo(target)) {
                source.copyTo(target, overwrite = true)
                source.delete()
            }
        }
    }

    private fun shrink(
        bytes: ByteArray,
        maxBytes: Int,
    ): ByteArray? {
        val bounds = boundsOf(bytes) ?: return null
        val options =
            BitmapFactory.Options().apply {
                inSampleSize = sampleSizeFor(bounds.first, bounds.second, UPLOAD_PX)
            }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        try {
            for (quality in UPLOAD_QUALITIES) {
                val out = ByteArrayOutputStream()
                bitmap.compress(uploadFormat(), quality, out)
                if (out.size() <= maxBytes) return out.toByteArray()
            }
        } finally {
            bitmap.recycle()
        }
        return null
    }

    @Suppress("DEPRECATION")
    private fun uploadFormat(): Bitmap.CompressFormat =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            Bitmap.CompressFormat.WEBP_LOSSY
        } else {
            Bitmap.CompressFormat.WEBP
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
        const val UPLOAD_PX = 400
        val UPLOAD_QUALITIES = intArrayOf(80, 60, 40)

        /** The exporter writes 400 px photos; a webp up to this size is trusted without decoding. */
        const val BULK_TRUSTED_PX = 512
        const val THUMBNAIL_PX = 96
        const val THUMBNAIL_QUALITY = 70

        /** A photo of 25 megapixels or more is not a food photo; refuse it rather than decode it later. */
        const val MAX_PIXELS = 25_000_000L
    }
}
