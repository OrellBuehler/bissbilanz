package com.bissbilanz.android.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

const val MAX_IMAGE_DIMENSION = 2048

/**
 * A captured or picked photo that could not be read back. Deliberately not an
 * [IOException] and carries no IOException cause: the error reporter drops both as
 * transient network noise, and this is a local failure that has to reach Sentry.
 * The message names the underlying exception class, the URI scheme and the byte
 * count, never the path.
 */
class ImageDecodeException(
    message: String,
) : Exception(message)

/** A cache-dir URI the camera can write a full-resolution capture into. */
fun createImageUri(
    context: Context,
    prefix: String,
): Uri {
    val file = File.createTempFile(prefix, ".jpg", context.cacheDir)
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

/**
 * Decodes [uri] into an upright bitmap (EXIF rotation applied) downscaled so its
 * longest side is at most [MAX_IMAGE_DIMENSION], which keeps OCR fast and avoids
 * out-of-memory on full-resolution camera photos.
 */
fun decodeUprightBitmap(
    context: Context,
    uri: Uri,
): Bitmap? {
    val resolver = context.contentResolver

    // With inJustDecodeBounds decodeStream returns null by contract and only fills
    // `bounds`; treating that null as a failed decode made every photo fail.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    val boundsStream = resolver.openInputStream(uri) ?: return null
    boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sample = 1
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    while (longest / sample > MAX_IMAGE_DIMENSION) sample *= 2

    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null

    val degrees = resolver.openInputStream(uri)?.use { exifRotationDegrees(it) } ?: 0f
    if (degrees == 0f) return bitmap

    val matrix = Matrix().apply { postRotate(degrees) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
}

/**
 * [decodeUprightBitmap] for callers that must act on a failure: throws an
 * [ImageDecodeException] saying what was wrong with the file instead of returning null.
 */
fun requireUprightBitmap(
    context: Context,
    uri: Uri,
): Bitmap {
    val bitmap =
        try {
            decodeUprightBitmap(context, uri)
        } catch (e: IOException) {
            throw ImageDecodeException("Could not read photo (${uri.scheme}): ${e.javaClass.simpleName}")
        }
    return bitmap ?: throw ImageDecodeException("Photo is not a decodable image (${uri.scheme}, ${byteCount(context, uri)})")
}

private fun byteCount(
    context: Context,
    uri: Uri,
): String =
    try {
        val length = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        if (length == null) "no stream" else "$length bytes"
    } catch (e: IOException) {
        "unreadable: ${e.javaClass.simpleName}"
    }

/**
 * JPEG bytes with the longest side capped at [maxDimension], matching what iOS
 * uploads for AI tasks. The defaults equal what the server keeps (it downsizes
 * every AI task photo to 1024px), so sending more only costs upload time.
 */
fun Bitmap.toJpegBytes(
    maxDimension: Int = 1024,
    quality: Int = 75,
): ByteArray = encode(Bitmap.CompressFormat.JPEG, maxDimension, quality)

/** PNG bytes with the longest side capped at [maxDimension]; keeps transparency. */
fun Bitmap.toPngBytes(maxDimension: Int = 1024): ByteArray = encode(Bitmap.CompressFormat.PNG, maxDimension, 100)

enum class ImageFormat(
    val extension: String,
    val mimeType: String,
) {
    Jpeg("jpg", "image/jpeg"),
    Png("png", "image/png"),
}

class EncodedImage(
    val bytes: ByteArray,
    val format: ImageFormat,
)

/**
 * PNG when [transparent] (a background was cut out, so alpha has to survive), JPEG otherwise.
 * Not decided by [Bitmap.hasAlpha]: an ARGB_8888 bitmap reports alpha even when every pixel
 * is opaque, which would turn every ordinary photo into a PNG.
 */
fun Bitmap.toUploadBytes(
    maxDimension: Int,
    quality: Int,
    transparent: Boolean,
): EncodedImage =
    if (transparent) {
        EncodedImage(toPngBytes(maxDimension), ImageFormat.Png)
    } else {
        EncodedImage(toJpegBytes(maxDimension, quality), ImageFormat.Jpeg)
    }

private fun Bitmap.encode(
    format: Bitmap.CompressFormat,
    maxDimension: Int,
    quality: Int,
): ByteArray {
    val longest = maxOf(width, height)
    val scaled =
        if (longest > maxDimension) {
            val ratio = maxDimension.toFloat() / longest
            Bitmap.createScaledBitmap(this, (width * ratio).toInt(), (height * ratio).toInt(), true)
        } else {
            this
        }
    return ByteArrayOutputStream().use { out ->
        scaled.compress(format, quality, out)
        out.toByteArray()
    }
}

private fun exifRotationDegrees(input: java.io.InputStream): Float =
    when (ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
    }
