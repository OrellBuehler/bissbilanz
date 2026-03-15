package com.bissbilanz.android.ui.components

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bissbilanz.android.ui.theme.ProjectionPurple
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.WeightBlue
import com.bissbilanz.model.WeightTrendEntry
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
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

    val textColor = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
    val textColorArgb =
        android.graphics.Color.argb(
            (textColor.alpha * 255).toInt(),
            (textColor.red * 255).toInt(),
            (textColor.green * 255).toInt(),
            (textColor.blue * 255).toInt(),
        )

    Canvas(modifier = modifier) {
        val leftPadding = 44.dp.toPx()
        val bottomPadding = 20.dp.toPx()
        val topPadding = 8.dp.toPx()
        val rightPadding = 8.dp.toPx()

        val chartWidth = size.width - leftPadding - rightPadding
        val chartHeight = size.height - topPadding - bottomPadding

        val state = chartState
        val yMin = state.yMin
        val yMax = state.yMax
        val yRange = (yMax - yMin).coerceAtLeast(1f)
        val maxDayIndex = state.maxDayIndex.coerceAtLeast(1f)

        fun xPos(dayIndex: Float): Float = leftPadding + (dayIndex / maxDayIndex) * chartWidth

        fun yPos(value: Float): Float = topPadding + (1f - (value - yMin) / yRange) * chartHeight

        // Y-axis labels
        val yTicks = 5
        val textPaint =
            Paint().apply {
                color = textColorArgb
                textSize = labelSizePx
                isAntiAlias = true
                textAlign = Paint.Align.RIGHT
                typeface = Typeface.DEFAULT
            }
        for (i in 0..yTicks) {
            val value = yMin + (yMax - yMin) * i / yTicks
            val y = yPos(value)
            drawContext.canvas.nativeCanvas.drawText(
                "%.1f".format(value),
                leftPadding - 6.dp.toPx(),
                y + labelSizePx / 3,
                textPaint,
            )
            // Grid line
            drawLine(
                color = Color.Gray.copy(alpha = 0.15f),
                start = Offset(leftPadding, y),
                end = Offset(size.width - rightPadding, y),
                strokeWidth = 1f,
            )
        }

        // X-axis labels
        val xLabelPaint =
            Paint().apply {
                color = textColorArgb
                textSize = labelSizePx * 0.9f
                isAntiAlias = true
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT
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

        // Clip data lines to reveal fraction
        clipRect(
            left = leftPadding,
            top = 0f,
            right = leftPadding + chartWidth * revealFraction.value,
            bottom = size.height,
        ) {
            // Draw actual weight line (blue)
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

            // Draw moving average line (green)
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

            // Draw projection line (purple dashed)
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
        trendData.mapNotNull { entry ->
            entry.movingAvg?.let {
                val date = LocalDate.parse(entry.entryDate.take(10))
                val dayIndex = (date.toEpochDays() - firstDate.toEpochDays()).toFloat()
                ProjectionPoint(dayIndex, it.toFloat())
            }
        }

    // Linear regression for projection
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

    // Date labels paired with their dayIndex for correct positioning
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

    // Compute Y range with 15% padding
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
