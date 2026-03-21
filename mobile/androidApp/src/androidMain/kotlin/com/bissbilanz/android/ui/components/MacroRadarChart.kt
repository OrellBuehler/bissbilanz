package com.bissbilanz.android.ui.components

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.*
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

data class RadarAxis(
    val label: String,
    val value: Float,
    val color: Color,
)

@Composable
fun MacroRadarChart(
    axes: List<RadarAxis>,
    modifier: Modifier = Modifier,
) {
    if (axes.isEmpty()) return

    val revealFraction = remember { Animatable(0f) }
    LaunchedEffect(axes) {
        revealFraction.snapTo(0f)
        revealFraction.animateTo(1f, animationSpec = tween(600, easing = EaseOutCubic))
    }

    val density = LocalDensity.current
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var selectedIndex by remember { mutableStateOf<Int?>(null) }
    var selectedOffset by remember { mutableStateOf(Offset.Zero) }

    val textPaint =
        remember(density) {
            Paint().apply {
                textSize = with(density) { 11.sp.toPx() }
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
                isAntiAlias = true
            }
        }

    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(240.dp)
                .onSizeChanged { containerSize = it },
    ) {
        Canvas(
            modifier =
                Modifier
                    .matchParentSize()
                    .pointerInput(axes) {
                        detectTapGestures { tapOffset ->
                            val cx = size.width / 2f
                            val cy = size.height / 2f
                            val radius = min(size.width, size.height) / 2f * 0.7f
                            val n = axes.size
                            val angleStep = 2 * PI / n
                            val startAngle = -PI / 2

                            val dx = tapOffset.x - cx
                            val dy = tapOffset.y - cy
                            val dist = sqrt(dx * dx + dy * dy)

                            if (dist > radius * 1.8f) {
                                selectedIndex = null
                                return@detectTapGestures
                            }

                            var tapAngle = atan2(dy.toDouble(), dx.toDouble())
                            if (tapAngle < startAngle) tapAngle += 2 * PI

                            var closest = 0
                            var minAngleDist = Double.MAX_VALUE
                            for (i in 0 until n) {
                                var axisAngle = startAngle + i * angleStep
                                if (axisAngle < startAngle) axisAngle += 2 * PI
                                val angleDiff = kotlin.math.abs(tapAngle - axisAngle)
                                val d = angleDiff.coerceAtMost(2 * PI - angleDiff)
                                if (d < minAngleDist) {
                                    minAngleDist = d
                                    closest = i
                                }
                            }

                            if (selectedIndex == closest) {
                                selectedIndex = null
                            } else {
                                selectedIndex = closest
                                val angle = startAngle + closest * angleStep
                                val v = axes[closest].value.coerceAtMost(1.5f)
                                val r = radius * v
                                selectedOffset =
                                    Offset(
                                        cx + (r * cos(angle)).toFloat(),
                                        cy + (r * sin(angle)).toFloat(),
                                    )
                            }
                        }
                    },
        ) {
            val cx = size.width / 2
            val cy = size.height / 2
            val radius = min(size.width, size.height) / 2 * 0.7f
            val n = axes.size
            val angleStep = 2 * PI / n
            val startAngle = -PI / 2

            for (ring in 1..4) {
                val r = radius * ring / 4f
                val ringPath = Path()
                for (i in 0 until n) {
                    val angle = startAngle + i * angleStep
                    val x = cx + r * cos(angle).toFloat()
                    val y = cy + r * sin(angle).toFloat()
                    if (i == 0) ringPath.moveTo(x, y) else ringPath.lineTo(x, y)
                }
                ringPath.close()
                drawPath(
                    ringPath,
                    color = Color.Gray.copy(alpha = 0.15f),
                    style = Stroke(width = 1f),
                )
            }

            for (i in 0 until n) {
                val angle = startAngle + i * angleStep
                val x = cx + radius * cos(angle).toFloat()
                val y = cy + radius * sin(angle).toFloat()
                drawLine(
                    color = Color.Gray.copy(alpha = 0.2f),
                    start = Offset(cx, cy),
                    end = Offset(x, y),
                    strokeWidth = 1f,
                )
            }

            val goalPath = Path()
            for (i in 0 until n) {
                val angle = startAngle + i * angleStep
                val x = cx + radius * cos(angle).toFloat()
                val y = cy + radius * sin(angle).toFloat()
                if (i == 0) goalPath.moveTo(x, y) else goalPath.lineTo(x, y)
            }
            goalPath.close()
            drawPath(
                goalPath,
                color = Color.Gray.copy(alpha = 0.5f),
                style =
                    Stroke(
                        width = 2f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
                    ),
            )

            val valuePath = Path()
            for (i in 0 until n) {
                val angle = startAngle + i * angleStep
                val v = (axes[i].value.coerceAtMost(1.5f)) * revealFraction.value
                val r = radius * v
                val x = cx + r * cos(angle).toFloat()
                val y = cy + r * sin(angle).toFloat()
                if (i == 0) valuePath.moveTo(x, y) else valuePath.lineTo(x, y)
            }
            valuePath.close()
            drawPath(
                valuePath,
                color = CaloriesBlue.copy(alpha = 0.2f * revealFraction.value),
            )
            drawPath(
                valuePath,
                color = CaloriesBlue.copy(alpha = 0.7f * revealFraction.value),
                style = Stroke(width = 2.5f),
            )

            for (i in 0 until n) {
                val angle = startAngle + i * angleStep
                val v = (axes[i].value.coerceAtMost(1.5f)) * revealFraction.value
                val r = radius * v
                val x = cx + r * cos(angle).toFloat()
                val y = cy + r * sin(angle).toFloat()
                val isSelected = selectedIndex == i
                drawCircle(
                    color = axes[i].color,
                    radius = if (isSelected) 7f else 4f,
                    center = Offset(x, y),
                )
                if (isSelected) {
                    drawCircle(
                        color = Color.White,
                        radius = 3f,
                        center = Offset(x, y),
                    )
                }
            }

            for (i in 0 until n) {
                val angle = startAngle + i * angleStep
                val labelR = radius + with(density) { 16.dp.toPx() }
                val x = cx + labelR * cos(angle).toFloat()
                val y = cy + labelR * sin(angle).toFloat()
                val pctStr = "${(axes[i].value * 100).toInt()}%"
                textPaint.color = axes[i].color.toArgb()
                drawContext.canvas.nativeCanvas.drawText(axes[i].label, x, y, textPaint)
                textPaint.color = axes[i].color.copy(alpha = 0.7f).toArgb()
                textPaint.textSize = with(density) { 9.sp.toPx() }
                drawContext.canvas.nativeCanvas.drawText(pctStr, x, y + textPaint.textSize + 2f, textPaint)
                textPaint.textSize = with(density) { 11.sp.toPx() }
            }
        }

        val selIdx = selectedIndex
        ChartTooltip(
            visible = selIdx != null,
            touchOffset = selectedOffset,
            containerSize = containerSize,
        ) {
            if (selIdx != null && selIdx in axes.indices) {
                val axis = axes[selIdx]
                Column {
                    Text(
                        axis.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                    )
                    Text(
                        stringResource(R.string.chart_percent_of_goal, (axis.value * 100).toInt()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}
