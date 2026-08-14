package com.bissbilanz.wear.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.bissbilanz.wear.R
import com.bissbilanz.wear.WearState
import kotlin.math.roundToInt

private val CaloriesBlue = Color(0xFF3B82F6)
private val ProteinRed = Color(0xFFEF4444)
private val CarbsOrange = Color(0xFFF97316)
private val FatYellow = Color(0xFFEAB308)
private val FiberGreen = Color(0xFF22C55E)

/** Today's calories against goal, with the four macros beneath — the watch's glance. */
@Composable
fun TodayScreen(state: WearState) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(88.dp)) {
            MacroRing(
                progress = progress(state.totals.calories, state.goals.calories),
                color = CaloriesBlue,
                strokeWidth = 8.dp.value,
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    state.totals.calories
                        .roundToInt()
                        .toString(),
                    style = MaterialTheme.typography.title2,
                )
                if (state.goals.calories > 0) {
                    Text(
                        stringResource(R.string.of_goal, state.goals.calories.roundToInt()),
                        style = MaterialTheme.typography.caption3,
                        color = MaterialTheme.colors.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MacroPill(stringResource(R.string.protein_short), state.totals.protein, state.goals.protein, ProteinRed)
            MacroPill(stringResource(R.string.carbs_short), state.totals.carbs, state.goals.carbs, CarbsOrange)
            MacroPill(stringResource(R.string.fat_short), state.totals.fat, state.goals.fat, FatYellow)
            MacroPill(stringResource(R.string.fiber_short), state.totals.fiber, state.goals.fiber, FiberGreen)
        }
    }
}

@Composable
private fun MacroPill(
    label: String,
    value: Double,
    goal: Double,
    color: Color,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(28.dp)) {
            MacroRing(progress = progress(value, goal), color = color, strokeWidth = 3.dp.value)
            Text(label, style = MaterialTheme.typography.caption3, color = color)
        }
        Text(
            value.roundToInt().toString(),
            style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun MacroRing(
    progress: Float,
    color: Color,
    strokeWidth: Float,
) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val inset = strokeWidth / 2
        val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
        drawArc(
            color = color.copy(alpha = 0.2f),
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arcSize,
            style = Stroke(width = strokeWidth),
        )
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = 360f * progress,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arcSize,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
        )
    }
}

/** Guards against a zero or missing goal, which would otherwise divide by zero. */
internal fun progress(
    value: Double,
    goal: Double,
): Float = if (goal <= 0) 0f else (value / goal).toFloat().coerceIn(0f, 1f)
