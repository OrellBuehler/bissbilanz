package com.bissbilanz.android.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.roundToInt

const val CUTOUT_MARGIN_FRACTION = 0.06f
private const val ALPHA_THRESHOLD = 8

data class PixelBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val width: Int get() = right - left
    val height: Int get() = bottom - top
}

data class SquarePlacement(
    val side: Int,
    val left: Int,
    val top: Int,
)

/**
 * Where a [contentWidth]x[contentHeight] subject goes on a transparent square so that its
 * longest side leaves [marginFraction] of the square free on both ends.
 */
fun squarePlacement(
    contentWidth: Int,
    contentHeight: Int,
    marginFraction: Float = CUTOUT_MARGIN_FRACTION,
): SquarePlacement {
    val side = (max(contentWidth, contentHeight) * (1f + 2f * marginFraction)).roundToInt().coerceAtLeast(1)
    return SquarePlacement(side, (side - contentWidth) / 2, (side - contentHeight) / 2)
}

/** The box around every pixel that is not (nearly) transparent, or null for an empty image. */
fun opaqueBounds(
    argb: IntArray,
    width: Int,
    height: Int,
): PixelBounds? {
    var left = width
    var top = height
    var right = -1
    var bottom = -1
    for (y in 0 until height) {
        for (x in 0 until width) {
            if ((argb[y * width + x] ushr 24) > ALPHA_THRESHOLD) {
                if (x < left) left = x
                if (x > right) right = x
                if (y < top) top = y
                if (y > bottom) bottom = y
            }
        }
    }
    return if (right < left || bottom < top) null else PixelBounds(left, top, right + 1, bottom + 1)
}

/**
 * Crops [this] to its non-transparent bounds and centres that on a transparent square with a
 * margin, so the square crop that follows can never clip a long subject. Null when nothing
 * visible is left.
 */
fun Bitmap.paddedToSquare(marginFraction: Float = CUTOUT_MARGIN_FRACTION): Bitmap? {
    val pixels = IntArray(width * height)
    getPixels(pixels, 0, width, 0, 0, width, height)
    val bounds = opaqueBounds(pixels, width, height) ?: return null
    val placement = squarePlacement(bounds.width, bounds.height, marginFraction)
    val square = Bitmap.createBitmap(placement.side, placement.side, Bitmap.Config.ARGB_8888)
    val subject = Bitmap.createBitmap(this, bounds.left, bounds.top, bounds.width, bounds.height)
    Canvas(square).drawBitmap(subject, placement.left.toFloat(), placement.top.toFloat(), null)
    return square
}

/** Background removal needs Google Play services, which delivers and runs the model. */
fun isSubjectCutoutSupported(context: Context): Boolean =
    GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

private fun segmenterOptions() = SubjectSegmenterOptions.Builder().enableForegroundBitmap().build()

/**
 * Makes sure Play services holds the segmentation model, installing it on first use.
 * [onDownloading] is called only when a download is actually needed.
 */
suspend fun ensureSubjectModel(
    context: Context,
    onDownloading: () -> Unit,
) {
    val segmenter = SubjectSegmentation.getClient(segmenterOptions())
    try {
        val installClient = ModuleInstall.getClient(context)
        if (installClient.areModulesAvailable(segmenter).await().areModulesAvailable()) return
        onDownloading()
        val request = ModuleInstallRequest.newBuilder().addApi(segmenter).build()
        installClient.installModules(request).await()
    } finally {
        segmenter.close()
    }
}

/**
 * The foreground subject of [bitmap] cropped to its bounds and centred on a transparent
 * square with a margin, or null when no subject was found. Installs the model first if
 * needed, calling [onDownloading] when that takes a download.
 */
suspend fun cutOutSubject(
    context: Context,
    bitmap: Bitmap,
    onDownloading: () -> Unit = {},
): Bitmap? {
    ensureSubjectModel(context, onDownloading)
    val segmenter: SubjectSegmenter = SubjectSegmentation.getClient(segmenterOptions())
    val foreground =
        try {
            segmenter.process(InputImage.fromBitmap(bitmap, 0)).await().foregroundBitmap
        } finally {
            segmenter.close()
        } ?: return null
    return withContext(Dispatchers.Default) { foreground.paddedToSquare() }
}
