package com.bissbilanz.android.ui.components

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.ProjectionPurple
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.WeightBlue
import com.bissbilanz.model.WeightTrendEntry
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlin.math.abs
import kotlin.math.ceil

internal data class ProjectionPoint(
    val dayIndex: Float,
    val weight: Float,
)

internal fun linearRegression(points: List<Pair<Float, Float>>): Pair<Float, Float>? {
    if (points.size < 3) return null
    val n = points.size
    val sumX = points.sumOf { it.first.toDouble() }.toFloat()
    val sumY = points.sumOf { it.second.toDouble() }.toFloat()
    val sumXY = points.sumOf { (it.first * it.second).toDouble() }.toFloat()
    val sumX2 = points.sumOf { (it.first * it.first).toDouble() }.toFloat()
    val denom = n * sumX2 - sumX * sumX
    return if (denom != 0f) {
        val slope = (n * sumXY - sumX * sumY) / denom
        val intercept = (sumY - slope * sumX) / n
        slope to intercept
    } else {
        0f to (sumY / n)
    }
}

private data class SelectedWeightPoint(
    val date: String,
    val weight: Float,
    val movingAvg: Float?,
    val canvasOffset: Offset,
)

@Composable
fun WeightTrendChart(
    trendData: List<WeightTrendEntry>,
    projectionDays: Int,
    modifier: Modifier = Modifier,
) {
    if (trendData.isEmpty()) return

    val density = LocalDensity.current
    val labelSizeSp = 10.sp
    val labelSizePx = with(density) { labelSizeSp.toPx() }

    val chartState =
        remember(trendData, projectionDays) {
            try {
                computeChartState(trendData, projectionDays)
            } catch (_: Exception) {
                null
            }
        }
    if (chartState == null) return

    val revealFraction = remember { Animatable(0f) }
    LaunchedEffect(chartState) {
        revealFraction.snapTo(0f)
        revealFraction.animateTo(1f, animationSpec = tween(600, easing = EaseOutCubic))
    }

    val textColor = MaterialTheme.colorScheme.onSurfaceVariant
    val textColorArgb =
        android.graphics.Color.argb(
            (textColor.alpha * 255).toInt(),
            (textColor.red * 255).toInt(),
            (textColor.green * 255).toInt(),
            (textColor.blue * 255).toInt(),
        )

    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var touchOffset by remember { mutableStateOf<Offset?>(null) }
    var selectedPoint by remember { mutableStateOf<SelectedWeightPoint?>(null) }

    val leftPaddingDp = 44.dp
    val bottomPaddingDp = 20.dp
    val topPaddingDp = 8.dp
    val rightPaddingDp = 8.dp

    val textPaint =
        remember(textColorArgb, labelSizePx) {
            Paint().apply {
                color = textColorArgb
                textSize = labelSizePx
                isAntiAlias = true
                textAlign = Paint.Align.RIGHT
                typeface = Typeface.DEFAULT
            }
        }
    val xLabelPaint =
        remember(textColorArgb, labelSizePx) {
            Paint().apply {
                color = textColorArgb
                textSize = labelSizePx * 0.9f
                isAntiAlias = true
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT
            }
        }

    val weightFormat = stringResource(R.string.chart_weight_format)
    val weightAvgFormat = stringResource(R.string.chart_weight_avg_format)

    Box(
        modifier = modifier.onSizeChanged { containerSize = it },
    ) {
        Canvas(
            modifier =
                Modifier
                    .matchParentSize()
                    .pointerInput(chartState) {
                        val leftPadding = leftPaddingDp.toPx()
                        val rightPadding = rightPaddingDp.toPx()
                        val topPadding = topPaddingDp.toPx()
                        val bottomPadding = bottomPaddingDp.toPx()
                        val chartWidth = size.width - leftPadding - rightPadding
                        val chartHeight = size.height - topPadding - bottomPadding
                        val maxDayIndex = chartState.maxDayIndex.coerceAtLeast(1f)
                        val yMin = chartState.yMin
                        val yRange = (chartState.yMax - yMin).coerceAtLeast(1f)

                        fun findNearest(x: Float): SelectedWeightPoint? {
                            val dayIndex = ((x - leftPadding) / chartWidth) * maxDayIndex
                            val nearest =
                                chartState.actualPoints.minByOrNull { abs(it.dayIndex - dayIndex) }
                                    ?: return null
                            val ptX = leftPadding + (nearest.dayIndex / maxDayIndex) * chartWidth
                            val ptY = topPadding + (1f - (nearest.weight - yMin) / yRange) * chartHeight
                            val idx = chartState.actualPoints.indexOf(nearest)
                            val entry = trendData.getOrNull(idx)
                            val dateLabel = entry?.entryDate?.take(10) ?: ""
                            val avgPt = chartState.movingAvgPoints.find { it.dayIndex == nearest.dayIndex }
                            return SelectedWeightPoint(dateLabel, nearest.weight, avgPt?.weight, Offset(ptX, ptY))
                        }

                        detectDragGestures(
                            onDragStart = { offset ->
                                val pt = findNearest(offset.x)
                                touchOffset = pt?.canvasOffset ?: offset
                                selectedPoint = pt
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                val pt = findNearest(change.position.x)
                                touchOffset = pt?.canvasOffset ?: change.position
                                selectedPoint = pt
                            },
                            onDragEnd = {
                                touchOffset = null
                                selectedPoint = null
                            },
                            onDragCancel = {
                                touchOffset = null
                                selectedPoint = null
                            },
                        )
                    },
        ) {
            val leftPadding = leftPaddingDp.toPx()
            val bottomPadding = bottomPaddingDp.toPx()
            val topPadding = topPaddingDp.toPx()
            val rightPadding = rightPaddingDp.toPx()

            val chartWidth = size.width - leftPadding - rightPadding
            val chartHeight = size.height - topPadding - bottomPadding

            val state = chartState
            val yMin = state.yMin
            val yMax = state.yMax
            val yRange = (yMax - yMin).coerceAtLeast(1f)
            val maxDayIndex = state.maxDayIndex.coerceAtLeast(1f)

            fun xPos(dayIndex: Float): Float = leftPadding + (dayIndex / maxDayIndex) * chartWidth

            fun yPos(value: Float): Float = topPadding + (1f - (value - yMin) / yRange) * chartHeight

            val yTicks = 5
            for (i in 0..yTicks) {
                val value = yMin + (yMax - yMin) * i / yTicks
                val y = yPos(value)
                drawContext.canvas.nativeCanvas.drawText(
                    weightFormat.format(value),
                    leftPadding - 6.dp.toPx(),
                    y + labelSizePx / 3,
                    textPaint,
                )
                drawLine(
                    color = Color.Gray.copy(alpha = 0.15f),
                    start = Offset(leftPadding, y),
                    end = Offset(size.width - rightPadding, y),
                    strokeWidth = 1f,
                )
            }

            val xLabelStep = ceil(state.dateLabels.size.toFloat() / 7f).toInt().coerceAtLeast(1)
            for (i in state.dateLabels.indices step xLabelStep) {
                val (dayIndex, label) = state.dateLabels[i]
                val x = xPos(dayIndex)
                drawContext.canvas.nativeCanvas.drawText(
                    label,
                    x,
                    size.height - 2.dp.toPx(),
                    xLabelPaint,
                )
            }

            clipRect(
                left = leftPadding,
                top = 0f,
                right = leftPadding + chartWidth * revealFraction.value,
                bottom = size.height,
            ) {
                if (state.actualPoints.size >= 2) {
                    val path = Path()
                    state.actualPoints.forEachIndexed { i, pt ->
                        val x = xPos(pt.dayIndex)
                        val y = yPos(pt.weight)
                        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(path, color = WeightBlue, style = Stroke(width = 3f, cap = StrokeCap.Round))
                    state.actualPoints.forEach { pt ->
                        drawCircle(color = WeightBlue, radius = 3f, center = Offset(xPos(pt.dayIndex), yPos(pt.weight)))
                    }
                }

                val avgPoints = state.movingAvgPoints
                if (avgPoints.size >= 2) {
                    val path = Path()
                    avgPoints.forEachIndexed { i, pt ->
                        val x = xPos(pt.dayIndex)
                        val y = yPos(pt.weight)
                        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(path, color = TrendGreen, style = Stroke(width = 2.5f, cap = StrokeCap.Round))
                }

                val projPoints = state.projectionPoints
                if (projPoints.size >= 2) {
                    val path = Path()
                    projPoints.forEachIndexed { i, pt ->
                        val x = xPos(pt.dayIndex)
                        val y = yPos(pt.weight)
                        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(
                        path,
                        color = ProjectionPurple,
                        style =
                            Stroke(
                                width = 2.5f,
                                cap = StrokeCap.Round,
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f)),
                            ),
                    )
                }

                // Crosshair and highlight for selected point
                val sel = selectedPoint
                if (sel != null) {
                    drawLine(
                        color = Color.Gray.copy(alpha = 0.5f),
                        start = Offset(sel.canvasOffset.x, topPadding),
                        end = Offset(sel.canvasOffset.x, topPadding + chartHeight),
                        strokeWidth = 1f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f)),
                    )
                    drawCircle(
                        color = WeightBlue,
                        radius = 6f,
                        center = sel.canvasOffset,
                    )
                    drawCircle(
                        color = Color.White,
                        radius = 3f,
                        center = sel.canvasOffset,
                    )
                }
            }
        }

        val sel = selectedPoint
        val tOff = touchOffset
        ChartTooltip(
            visible = sel != null && tOff != null,
            touchOffset = tOff ?: Offset.Zero,
            containerSize = containerSize,
        ) {
            if (sel != null) {
                Column {
                    Text(
                        sel.date,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                    )
                    Text(
                        weightFormat.format(sel.weight),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                    )
                    if (sel.movingAvg != null) {
                        Text(
                            weightAvgFormat.format(sel.movingAvg),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                        )
                    }
                }
            }
        }
    }
}

private data class ChartState(
    val actualPoints: List<ProjectionPoint>,
    val movingAvgPoints: List<ProjectionPoint>,
    val projectionPoints: List<ProjectionPoint>,
    val dateLabels: List<Pair<Float, String>>,
    val yMin: Float,
    val yMax: Float,
    val maxDayIndex: Float,
)

private fun computeChartState(
    trendData: List<WeightTrendEntry>,
    projectionDays: Int,
): ChartState {
    val firstDate = LocalDate.parse(trendData.first().entryDate.take(10))

    val actualPoints =
        trendData.map { entry ->
            val date = LocalDate.parse(entry.entryDate.take(10))
            val dayIndex = (date.toEpochDays() - firstDate.toEpochDays()).toFloat()
            ProjectionPoint(dayIndex, entry.weightKg.toFloat())
        }

    val movingAvgPoints =
        trendData.map { entry ->
            val date = LocalDate.parse(entry.entryDate.take(10))
            val dayIndex = (date.toEpochDays() - firstDate.toEpochDays()).toFloat()
            ProjectionPoint(dayIndex, entry.movingAvg.toFloat())
        }

    val projectionPoints = mutableListOf<ProjectionPoint>()
    if (projectionDays > 0 && trendData.size >= 3) {
        val regressionPoints = actualPoints.map { it.dayIndex to it.weight }
        val (slope, intercept) = linearRegression(regressionPoints) ?: (0f to actualPoints.last().weight)

        val lastDayIndex = actualPoints.last().dayIndex
        projectionPoints.add(ProjectionPoint(lastDayIndex, slope * lastDayIndex + intercept))
        for (d in 1..projectionDays) {
            val idx = lastDayIndex + d
            projectionPoints.add(ProjectionPoint(idx, slope * idx + intercept))
        }
    }

    val lastDayIndex = actualPoints.lastOrNull()?.dayIndex ?: 0f
    val maxDayIndex = lastDayIndex + projectionDays.coerceAtLeast(0)

    val dateLabels = mutableListOf<Pair<Float, String>>()
    for (entry in trendData) {
        val date = LocalDate.parse(entry.entryDate.take(10))
        val dayIndex = (date.toEpochDays() - firstDate.toEpochDays()).toFloat()
        dateLabels.add(dayIndex to "${date.dayOfMonth}/${date.monthNumber}")
    }
    if (projectionDays > 0 && trendData.isNotEmpty()) {
        val lastDate = LocalDate.parse(trendData.last().entryDate.take(10))
        for (d in 1..projectionDays) {
            val futureDate = lastDate.plus(d, DateTimeUnit.DAY)
            dateLabels.add((lastDayIndex + d) to "${futureDate.dayOfMonth}/${futureDate.monthNumber}")
        }
    }

    val allValues = mutableListOf<Float>()
    actualPoints.forEach { allValues.add(it.weight) }
    movingAvgPoints.forEach { allValues.add(it.weight) }
    projectionPoints.forEach { allValues.add(it.weight) }
    val rawMin = allValues.minOrNull() ?: 0f
    val rawMax = allValues.maxOrNull() ?: 100f
    val padding = ((rawMax - rawMin) * 0.15f).coerceAtLeast(1f)
    val yMin = rawMin - padding
    val yMax = rawMax + padding

    return ChartState(
        actualPoints = actualPoints,
        movingAvgPoints = movingAvgPoints,
        projectionPoints = projectionPoints,
        dateLabels = dateLabels,
        yMin = yMin,
        yMax = yMax,
        maxDayIndex = maxDayIndex,
    )
}
