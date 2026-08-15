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

const val MAX_IMAGE_DIMENSION = 2048

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

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
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
 * JPEG bytes with the longest side capped at [maxDimension], matching what iOS
 * uploads for AI tasks — a full-resolution capture is needlessly large for a
 * photo the assistant only has to recognise a meal in.
 */
fun Bitmap.toJpegBytes(
    maxDimension: Int = 1600,
    quality: Int = 80,
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
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
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
