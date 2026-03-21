package com.bissbilanz.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import com.bissbilanz.android.R
import com.bissbilanz.model.MealBreakdownEntry
import kotlin.math.roundToInt

val MealColors =
    listOf(
        Color(0xFF3B82F6),
        Color(0xFFEF4444),
        Color(0xFFF97316),
        Color(0xFFEAB308),
        Color(0xFF22C55E),
        Color(0xFF8B5CF6),
        Color(0xFFEC4899),
        Color(0xFF14B8A6),
    )

@Composable
fun SimplePieChart(
    entries: List<MealBreakdownEntry>,
    modifier: Modifier = Modifier,
) {
    val total = entries.sumOf { it.calories }.toFloat()
    if (total <= 0f) return
    val surfaceColor = MaterialTheme.colorScheme.surfaceContainerLow

    val sweepFraction = remember { Animatable(0f) }
    LaunchedEffect(entries) {
        sweepFraction.snapTo(0f)
        sweepFraction.animateTo(1f, animationSpec = tween(600, easing = EaseOutCubic))
    }

    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var selectedIndex by remember { mutableStateOf<Int?>(null) }
    var tapOffset by remember { mutableStateOf(Offset.Zero) }

    val kcalPctFormat = stringResource(R.string.chart_kcal_pct_format)

    Box(modifier = modifier.onSizeChanged { containerSize = it }) {
        Canvas(
            modifier =
                Modifier
                    .matchParentSize()
                    .pointerInput(entries) {
                        detectTapGestures { offset ->
                            val cx = size.width / 2f
                            val cy = size.height / 2f
                            val diameter = minOf(size.width, size.height) * 0.8f
                            val radius = diameter / 2f
                            val innerRadius = radius * 0.5f

                            val dx = offset.x - cx
                            val dy = offset.y - cy
                            val dist = kotlin.math.sqrt(dx * dx + dy * dy)

                            if (dist < innerRadius || dist > radius) {
                                selectedIndex = null
                                return@detectTapGestures
                            }

                            var angle = Math.toDegrees(kotlin.math.atan2(dy.toDouble(), dx.toDouble())).toFloat()
                            angle = (angle + 90f + 360f) % 360f

                            var cumulative = 0f
                            var found = -1
                            for (i in entries.indices) {
                                val sweep = (entries[i].calories.toFloat() / total) * 360f
                                if (angle >= cumulative && angle < cumulative + sweep) {
                                    found = i
                                    break
                                }
                                cumulative += sweep
                            }

                            if (found >= 0) {
                                if (selectedIndex == found) {
                                    selectedIndex = null
                                } else {
                                    selectedIndex = found
                                    tapOffset = offset
                                }
                            } else {
                                selectedIndex = null
                            }
                        }
                    },
        ) {
            val diameter = minOf(size.width, size.height) * 0.8f
            val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
            var startAngle = -90f

            entries.forEachIndexed { index, entry ->
                val sweep = (entry.calories.toFloat() / total) * 360f * sweepFraction.value
                val isSelected = selectedIndex == index
                val arcColor = MealColors[index % MealColors.size]
                drawArc(
                    color = if (isSelected) arcColor else arcColor.copy(alpha = if (selectedIndex != null) 0.5f else 1f),
                    startAngle = startAngle,
                    sweepAngle = sweep,
                    useCenter = true,
                    topLeft = topLeft,
                    size = Size(diameter, diameter),
                )
                startAngle += sweep
            }

            val innerDiameter = diameter * 0.5f
            val innerTopLeft = Offset((size.width - innerDiameter) / 2f, (size.height - innerDiameter) / 2f)
            drawOval(
                color = surfaceColor,
                topLeft = innerTopLeft,
                size = Size(innerDiameter, innerDiameter),
            )
        }

        val selIdx = selectedIndex
        ChartTooltip(
            visible = selIdx != null,
            touchOffset = tapOffset,
            containerSize = containerSize,
        ) {
            if (selIdx != null && selIdx in entries.indices) {
                val entry = entries[selIdx]
                val pct = (entry.calories / total * 100).roundToInt()
                Column {
                    Text(
                        entry.mealType.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.inverseOnSurface,
                    )
                    Text(
                        kcalPctFormat.format(entry.calories.roundToInt(), pct),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}
