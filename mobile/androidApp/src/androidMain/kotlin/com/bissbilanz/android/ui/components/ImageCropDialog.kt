package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
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
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            var scale by remember { mutableFloatStateOf(1f) }
            var offsetX by remember { mutableFloatStateOf(0f) }
            var offsetY by remember { mutableFloatStateOf(0f) }

            BoxWithConstraints(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
            ) {
                val window = with(androidx.compose.ui.platform.LocalDensity.current) { maxWidth.toPx() }
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

                Box(
                    modifier =
                        Modifier
                            .size(maxWidth)
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
                        modifier =
                            Modifier
                                .size(
                                    with(androidx.compose.ui.platform.LocalDensity.current) { w.toDp() },
                                    with(androidx.compose.ui.platform.LocalDensity.current) { h.toDp() },
                                ).graphicsLayer(
                                    scaleX = scale,
                                    scaleY = scale,
                                    translationX = offsetX,
                                    translationY = offsetY,
                                ),
                    )
                }

                Row(
                    modifier =
                        Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    TextButton(onClick = onCancel) {
                        Text(stringResource(R.string.food_image_crop_cancel), color = Color.White)
                    }
                    Button(onClick = { onCropped(cropSquare(bitmap, window, baseScale, scale, offsetX, offsetY)) }) {
                        Text(stringResource(R.string.food_image_crop_confirm))
                    }
                }
            }

            Text(
                stringResource(R.string.food_image_crop_hint),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White,
                modifier = Modifier.padding(24.dp),
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
