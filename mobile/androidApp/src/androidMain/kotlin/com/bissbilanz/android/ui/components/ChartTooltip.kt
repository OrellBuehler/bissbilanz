package com.bissbilanz.android.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp

@Composable
fun BoxScope.ChartTooltip(
    visible: Boolean,
    touchOffset: Offset,
    containerSize: IntSize,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val margin = with(density) { 12.dp.toPx() }
    var tooltipSize by remember { mutableStateOf(IntSize.Zero) }

    val x =
        if (touchOffset.x + margin + tooltipSize.width > containerSize.width) {
            (touchOffset.x - margin - tooltipSize.width).toInt()
        } else {
            (touchOffset.x + margin).toInt()
        }
    val y =
        if (touchOffset.y - tooltipSize.height - margin < 0) {
            (touchOffset.y + margin).toInt()
        } else {
            (touchOffset.y - tooltipSize.height - margin).toInt()
        }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(animationSpec = tween(100)),
        exit = fadeOut(animationSpec = tween(100)),
        modifier =
            Modifier
                .offset { IntOffset(x, y) },
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.inverseSurface,
            tonalElevation = 4.dp,
            shadowElevation = 4.dp,
            modifier = Modifier.onSizeChanged { tooltipSize = it },
        ) {
            Box(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                content()
            }
        }
    }
}
