package com.bissbilanz.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import kotlin.math.roundToInt

@Composable
fun SimpleLineChart(
    data: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
    unit: String = "",
) {
    if (data.isEmpty()) return
    val maxVal = data.max().coerceAtLeast(1f)
    val minVal = data.min()

    val revealFraction = remember { Animatable(0f) }
    LaunchedEffect(data) {
        revealFraction.snapTo(0f)
        revealFraction.animateTo(1f, animationSpec = tween(500, easing = EaseOutCubic))
    }

    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var selectedIndex by remember { mutableStateOf<Int?>(null) }
    var touchOffset by remember { mutableStateOf<Offset?>(null) }

    Box(modifier = modifier.onSizeChanged { containerSize = it }) {
        Canvas(
            modifier =
                Modifier
                    .matchParentSize()
                    .pointerInput(data) {
                        detectDragGestures(
                            onDragStart = { offset ->
                                val stepX = size.width.toFloat() / (data.size - 1).coerceAtLeast(1)
                                val idx = (offset.x / stepX).toInt().coerceIn(0, data.lastIndex)
                                selectedIndex = idx
                                touchOffset = offset
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                val stepX = size.width.toFloat() / (data.size - 1).coerceAtLeast(1)
                                val idx = (change.position.x / stepX).toInt().coerceIn(0, data.lastIndex)
                                selectedIndex = idx
                                touchOffset = change.position
                            },
                            onDragEnd = {
                                selectedIndex = null
                                touchOffset = null
                            },
                            onDragCancel = {
                                selectedIndex = null
                                touchOffset = null
                            },
                        )
                    },
        ) {
            clipRect(right = size.width * revealFraction.value) {
                val stepX = size.width / (data.size - 1).coerceAtLeast(1)
                val range = (maxVal - minVal).coerceAtLeast(1f)
                val padding = 8f

                val path = Path()
                data.forEachIndexed { i, value ->
                    val x = i * stepX
                    val y = size.height - padding - ((value - minVal) / range) * (size.height - padding * 2)
                    if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }

                drawPath(path, color = color, style = Stroke(width = 3f, cap = StrokeCap.Round))

                data.forEachIndexed { i, value ->
                    val x = i * stepX
                    val y = size.height - padding - ((value - minVal) / range) * (size.height - padding * 2)
                    val isSelected = selectedIndex == i
                    drawCircle(color = color, radius = if (isSelected) 6f else 3f, center = Offset(x, y))
                    if (isSelected) {
                        drawCircle(color = Color.White, radius = 3f, center = Offset(x, y))
                        drawLine(
                            color = Color.Gray.copy(alpha = 0.4f),
                            start = Offset(x, 0f),
                            end = Offset(x, size.height),
                            strokeWidth = 1f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 3f)),
                        )
                    }
                }
            }
        }

        val selIdx = selectedIndex
        val tOff = touchOffset
        ChartTooltip(
            visible = selIdx != null && tOff != null,
            touchOffset = tOff ?: Offset.Zero,
            containerSize = containerSize,
        ) {
            if (selIdx != null && selIdx in data.indices) {
                Text(
                    "${data[selIdx].roundToInt()}${if (unit.isNotEmpty()) " $unit" else ""}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.inverseOnSurface,
                )
            }
        }
    }
}
