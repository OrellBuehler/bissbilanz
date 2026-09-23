package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.bissbilanz.android.R
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Square pan-and-zoom cropper.
 *
 * The crop is locked to 1:1 because the server resizes uploads to 400×400 with
 * `fit: 'cover'` — a free-form crop would be silently re-cropped there and the
 * user's framing would not survive. Locking the ratio makes what they see what
 * they get.
 *
 * The part of the photo outside the square stays visible under a dimming, so
 * the user sees what they are cutting away, not just what remains.
 */
@Composable
fun ImageCropDialog(
    bitmap: Bitmap,
    onCancel: () -> Unit,
    onCropped: (Bitmap) -> Unit,
) {
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        var scale by remember { mutableFloatStateOf(1f) }
        var offsetX by remember { mutableFloatStateOf(0f) }
        var offsetY by remember { mutableFloatStateOf(0f) }

        BoxWithConstraints(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black),
        ) {
            val density = LocalDensity.current
            // Inset from the edges so the frame and the dimmed photo beside it
            // stay visible, not only above and below.
            val windowDp = minOf(maxWidth, maxHeight) - 32.dp
            val window = with(density) { windowDp.toPx() }
            // Scale that makes the photo cover the square window, so there is
            // never a gap inside the crop area at rest.
            val baseScale = max(window / bitmap.width, window / bitmap.height)
            val displayed = { s: Float -> Pair(bitmap.width * baseScale * s, bitmap.height * baseScale * s) }

            fun clamp() {
                val (w, h) = displayed(scale)
                val maxX = max(0f, (w - window) / 2f)
                val maxY = max(0f, (h - window) / 2f)
                offsetX = offsetX.coerceIn(-maxX, maxX)
                offsetY = offsetY.coerceIn(-maxY, maxY)
            }

            // The whole screen takes the gesture, dimmed area included, so a
            // pan that starts outside the square still moves the photo.
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .clipToBounds()
                        .pointerInput(bitmap) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                scale = (scale * zoom).coerceIn(1f, 6f)
                                offsetX += pan.x
                                offsetY += pan.y
                                clamp()
                            }
                        },
                contentAlignment = Alignment.Center,
            ) {
                val (w, h) = displayed(1f)
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.FillBounds,
                    // `requiredSize`, not `size`: the photo is larger than the
                    // square on one axis, and `size` would let the parent's
                    // constraints shrink it back to fit — the crop math assumes
                    // it is drawn at exactly this size.
                    modifier =
                        Modifier
                            .requiredSize(
                                with(density) { w.toDp() },
                                with(density) { h.toDp() },
                            ).graphicsLayer(
                                scaleX = scale,
                                scaleY = scale,
                                translationX = offsetX,
                                translationY = offsetY,
                            ),
                )
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val crop =
                        Rect(
                            offset = Offset((size.width - window) / 2f, (size.height - window) / 2f),
                            size = Size(window, window),
                        )
                    val dimming =
                        Path().apply {
                            fillType = PathFillType.EvenOdd
                            addRect(Rect(Offset.Zero, size))
                            addRect(crop)
                        }
                    drawPath(dimming, Color.Black.copy(alpha = 0.6f))
                    // Rule-of-thirds guides.
                    val guide = Color.White.copy(alpha = 0.35f)
                    for (i in 1..2) {
                        val x = crop.left + crop.width * i / 3f
                        val y = crop.top + crop.height * i / 3f
                        drawLine(guide, Offset(x, crop.top), Offset(x, crop.bottom), strokeWidth = 1f)
                        drawLine(guide, Offset(crop.left, y), Offset(crop.right, y), strokeWidth = 1f)
                    }
                    drawRect(
                        Color.White,
                        topLeft = crop.topLeft,
                        size = crop.size,
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                }
            }

            Row(
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .safeDrawingPadding()
                        .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = onCancel) {
                    Text(stringResource(R.string.food_image_crop_cancel), color = Color.White)
                }
                Button(onClick = { onCropped(cropSquare(bitmap, window, baseScale, scale, offsetX, offsetY)) }) {
                    Text(stringResource(R.string.food_image_crop_confirm))
                }
            }

            Text(
                stringResource(R.string.food_image_crop_hint),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .safeDrawingPadding()
                        .padding(24.dp)
                        .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(50))
                        .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

/**
 * Maps the on-screen crop window back into bitmap coordinates. The image is
 * drawn centred at `baseScale * scale` and shifted by the pan offset, so the
 * window's top-left in image space is the half-difference of the two sizes,
 * minus the offset, divided by the total scale.
 */
private fun cropSquare(
    bitmap: Bitmap,
    window: Float,
    baseScale: Float,
    scale: Float,
    offsetX: Float,
    offsetY: Float,
): Bitmap {
    val total = baseScale * scale
    val displayedWidth = bitmap.width * total
    val displayedHeight = bitmap.height * total
    val left = ((displayedWidth - window) / 2f - offsetX) / total
    val top = ((displayedHeight - window) / 2f - offsetY) / total
    val side = window / total

    val size = min(side, min(bitmap.width.toFloat(), bitmap.height.toFloat())).roundToInt().coerceAtLeast(1)
    val x = left.roundToInt().coerceIn(0, (bitmap.width - size).coerceAtLeast(0))
    val y = top.roundToInt().coerceIn(0, (bitmap.height - size).coerceAtLeast(0))
    return Bitmap.createBitmap(bitmap, x, y, size, size)
}
