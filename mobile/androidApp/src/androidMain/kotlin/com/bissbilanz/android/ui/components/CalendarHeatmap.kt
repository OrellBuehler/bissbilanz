package com.bissbilanz.android.ui.components

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
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
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.model.CalendarDay
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun CalendarHeatmap(
    days: List<CalendarDay>,
    calorieGoal: Double,
    month: Int,
    year: Int,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onDayClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val revealFraction = remember { Animatable(0f) }
    LaunchedEffect(month, year) {
        revealFraction.snapTo(0f)
        revealFraction.animateTo(1f, animationSpec = tween(400, easing = EaseOutCubic))
    }

    val monthName = Month(month).name.lowercase().replaceFirstChar { it.uppercase() }

    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onPrevMonth) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous month")
            }
            Text(
                "$monthName $year",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            IconButton(onClick = onNextMonth) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next month")
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        val dayMap = remember(days) { days.associateBy { it.date } }
        val firstOfMonth = LocalDate(year, month, 1)
        val daysInMonth =
            when (month) {
                2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
                4, 6, 9, 11 -> 30
                else -> 31
            }
        val startDow = firstOfMonth.dayOfWeek
        val offset = (startDow.ordinal - DayOfWeek.MONDAY.ordinal + 7) % 7

        val onSurface = MaterialTheme.colorScheme.onSurface
        val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant
        val density = LocalDensity.current

        val dayHeaders = listOf("M", "T", "W", "T", "F", "S", "S")
        val totalRows = ((offset + daysInMonth + 6) / 7)
        val headerHeight = with(density) { 20.dp.toPx() }
        val cellPadding = with(density) { 2.dp.toPx() }
        val canvasHeight = with(density) { (headerHeight + (totalRows * (36.dp.toPx() + cellPadding))).toDp() }

        var containerSize by remember { mutableStateOf(IntSize.Zero) }
        var selectedDay by remember { mutableStateOf<String?>(null) }
        var tooltipOffset by remember { mutableStateOf(Offset.Zero) }

        LaunchedEffect(month, year) {
            selectedDay = null
        }

        val headerPaint =
            remember(onSurface) {
                Paint().apply {
                    color = onSurface.copy(alpha = 0.5f).toArgb()
                    textSize = with(density) { 11.sp.toPx() }
                    textAlign = Paint.Align.CENTER
                    typeface = Typeface.DEFAULT
                }
            }
        val dayTextPaint =
            remember {
                Paint().apply {
                    textSize = with(density) { 12.sp.toPx() }
                    textAlign = Paint.Align.CENTER
                    typeface = Typeface.DEFAULT
                }
            }

        val noDataText = stringResource(R.string.chart_no_data)

        Box(modifier = Modifier.fillMaxWidth().onSizeChanged { containerSize = it }) {
            Canvas(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(canvasHeight)
                        .pointerInput(month, year) {
                            detectTapGestures { tapOffset ->
                                val cellW = size.width / 7f
                                val cellH = (size.height - headerHeight) / totalRows.toFloat()
                                val col = (tapOffset.x / cellW).toInt()
                                val row = ((tapOffset.y - headerHeight) / cellH).toInt()
                                if (row >= 0 && col in 0..6) {
                                    val dayNum = row * 7 + col - offset + 1
                                    if (dayNum in 1..daysInMonth) {
                                        val date = LocalDate(year, month, dayNum).toString()
                                        if (selectedDay == date) {
                                            selectedDay = null
                                        } else {
                                            selectedDay = date
                                            tooltipOffset = tapOffset
                                            onDayClick(date)
                                        }
                                    }
                                }
                            }
                        },
            ) {
                val cellW = size.width / 7f
                val cellH = (size.height - headerHeight) / totalRows.toFloat()

                dayHeaders.forEachIndexed { i, label ->
                    drawContext.canvas.nativeCanvas.drawText(
                        label,
                        cellW * i + cellW / 2,
                        headerHeight - 4f,
                        headerPaint,
                    )
                }

                for (day in 1..daysInMonth) {
                    val idx = offset + day - 1
                    val row = idx / 7
                    val col = idx % 7
                    val x = col * cellW + cellPadding
                    val y = headerHeight + row * cellH + cellPadding
                    val w = cellW - cellPadding * 2
                    val h = cellH - cellPadding * 2

                    val dateStr = LocalDate(year, month, day).toString()
                    val calDay = dayMap[dateStr]

                    val bgColor =
                        if (calDay != null && calDay.hasEntries && calorieGoal > 0) {
                            val ratio = calDay.calories / calorieGoal
                            val dist = abs(1.0 - ratio)
                            if (dist <= 0.10) {
                                FiberGreen.copy(alpha = 0.9f * revealFraction.value)
                            } else if (ratio > 1.0) {
                                val intensity = min(dist / 0.5, 1.0).toFloat()
                                ProteinRed.copy(alpha = (0.2f + 0.6f * intensity) * revealFraction.value)
                            } else {
                                val intensity = min(dist / 0.5, 1.0).toFloat()
                                CaloriesBlue.copy(alpha = (0.2f + 0.6f * intensity) * revealFraction.value)
                            }
                        } else {
                            surfaceVariant.copy(alpha = 0.3f * revealFraction.value)
                        }

                    drawRoundRect(
                        color = bgColor,
                        topLeft = Offset(x, y),
                        size = Size(w, h),
                        cornerRadius = CornerRadius(4f, 4f),
                    )

                    val textColor =
                        if (calDay != null && calDay.hasEntries && calorieGoal > 0) {
                            onSurface
                        } else {
                            onSurface.copy(alpha = 0.4f)
                        }
                    dayTextPaint.color = textColor.toArgb()

                    drawContext.canvas.nativeCanvas.drawText(
                        "$day",
                        x + w / 2,
                        y + h / 2 + dayTextPaint.textSize / 3,
                        dayTextPaint,
                    )
                }
            }

            val selDay = selectedDay
            val calDay = selDay?.let { dayMap[it] }
            ChartTooltip(
                visible = selDay != null,
                touchOffset = tooltipOffset,
                containerSize = containerSize,
            ) {
                if (selDay != null) {
                    Column {
                        Text(
                            selDay,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                        )
                        if (calDay != null && calDay.hasEntries) {
                            Text(
                                stringResource(R.string.chart_kcal_format, calDay.calories.roundToInt()),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.inverseOnSurface,
                            )
                            if (calorieGoal > 0) {
                                val pct = (calDay.calories / calorieGoal * 100).roundToInt()
                                Text(
                                    stringResource(R.string.chart_percent_of_goal, pct),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                                )
                            }
                        } else {
                            Text(
                                noDataText,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.5f),
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LegendDot(color = FiberGreen, label = "On target")
            Spacer(modifier = Modifier.width(12.dp))
            LegendDot(color = ProteinRed, label = "Over")
            Spacer(modifier = Modifier.width(12.dp))
            LegendDot(color = CaloriesBlue, label = "Under")
            Spacer(modifier = Modifier.width(12.dp))
            LegendDot(color = Color.Gray.copy(alpha = 0.3f), label = "No data")
        }
    }
}

@Composable
private fun LegendDot(
    color: Color,
    label: String,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Canvas(modifier = Modifier.size(10.dp)) {
            drawCircle(color = color)
        }
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
