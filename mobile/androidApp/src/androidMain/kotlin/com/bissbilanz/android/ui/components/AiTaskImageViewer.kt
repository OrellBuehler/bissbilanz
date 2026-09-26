package com.bissbilanz.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.bissbilanz.android.R

/**
 * Full-screen viewer for an AI task's photos, opened from [com.bissbilanz.android.ui.screens.AiTasksScreen]
 * by tapping a thumbnail, so the user can check a photo against what the
 * assistant read from it. Swipeable between photos; pinch to zoom the one on
 * screen.
 *
 * Images load through [FoodImage] — the same authenticated, cache-first path
 * food and recipe photos use — rather than a bare Coil URL, since the server
 * requires the account's bearer token to serve an `/uploads/…` file.
 */
@Composable
fun AiTaskImageViewer(
    imageUrls: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val pagerState = rememberPagerState(initialPage = initialIndex) { imageUrls.size }
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                ZoomableTaskImage(
                    imageUrl = imageUrls[page],
                    contentDescription =
                        stringResource(R.string.ai_tasks_photo_index, page + 1, imageUrls.size),
                )
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
                colors =
                    IconButtonDefaults.iconButtonColors(
                        containerColor = Color.Black.copy(alpha = 0.55f),
                        contentColor = Color.White,
                    ),
            ) {
                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.ai_tasks_photo_viewer_close))
            }
        }
    }
}

/**
 * One photo, pinch-zoomable up to 4x and reset by a double tap.
 *
 * Panning while zoomed is intentionally left out: a single-finger drag on top
 * of the pager would compete with its own swipe-between-photos gesture, and
 * pinch plus double-tap-to-reset already covers "zoom in to check a detail"
 * without that conflict.
 */
@Composable
private fun ZoomableTaskImage(
    imageUrl: String,
    contentDescription: String?,
) {
    var scale by remember(imageUrl) { mutableFloatStateOf(1f) }
    FoodImage(
        imageUrl = imageUrl,
        contentDescription = contentDescription,
        contentScale = ContentScale.Fit,
        modifier =
            Modifier
                .fillMaxSize()
                .graphicsLayer(scaleX = scale, scaleY = scale)
                .pointerInput(imageUrl) {
                    detectTransformGestures { _, _, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 4f)
                    }
                }.pointerInput(imageUrl) {
                    detectTapGestures(onDoubleTap = { scale = if (scale > 1f) 1f else 2.5f })
                },
    )
}
