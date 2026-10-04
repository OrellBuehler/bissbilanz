package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.bissbilanz.android.R

/**
 * Full preview of a photo that is uploaded as it is (no crop), with the "Remove background"
 * toggle. [onConfirm] gets the photo to use and whether it is a transparent cut-out.
 */
@Composable
fun PhotoReviewDialog(
    bitmap: Bitmap,
    onCancel: () -> Unit,
    onConfirm: (Bitmap, Boolean) -> Unit,
) {
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val cutout = rememberCutoutState(bitmap)
        val shown = cutout.shown

        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black),
        ) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .fillMaxWidth()
                        .aspectRatio(shown.width.toFloat() / shown.height),
            ) {
                if (cutout.transparent) Checkerboard(Modifier.fillMaxSize())
                Image(
                    bitmap = shown.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
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
                Button(onClick = { onConfirm(shown, cutout.transparent) }, enabled = !cutout.busy) {
                    Text(stringResource(R.string.food_image_crop_confirm))
                }
            }

            CutoutToggle(
                cutout,
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .safeDrawingPadding()
                        .padding(24.dp),
            )
        }
    }
}
