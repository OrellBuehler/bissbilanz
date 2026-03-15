package com.bissbilanz.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.GentleSpring
import kotlin.math.min

@Composable
fun MacroRing(
    label: String,
    current: Double,
    goal: Double,
    color: Color,
    size: Dp = 64.dp,
    strokeWidth: Dp = 6.dp,
    showGoal: Boolean = false,
) {
    val progress = if (goal > 0) (current / goal).toFloat() else 0f

    val animatedProgress = remember { Animatable(0f) }
    LaunchedEffect(progress) {
        animatedProgress.animateTo(progress, animationSpec = GentleSpring)
    }

    val animatedCounter by animateIntAsState(
        targetValue = current.toInt(),
        animationSpec = spring(dampingRatio = 0.9f, stiffness = 200f),
        label = "counter",
    )

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(size)) {
            Canvas(modifier = Modifier.fillMaxSize().padding(4.dp)) {
                val sw = strokeWidth.toPx()
                drawArc(
                    color = color.copy(alpha = 0.2f),
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = sw, cap = StrokeCap.Round),
                )
                drawArc(
                    color = if (animatedProgress.value > 1f) color.copy(alpha = 0.6f) else color,
                    startAngle = -90f,
                    sweepAngle = min(animatedProgress.value, 1f) * 360f,
                    useCenter = false,
                    style = Stroke(width = sw, cap = StrokeCap.Round),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = animatedCounter.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = color,
                )
                if (showGoal) {
                    Text(
                        text = "/ ${goal.toInt()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = color.copy(alpha = 0.6f),
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
