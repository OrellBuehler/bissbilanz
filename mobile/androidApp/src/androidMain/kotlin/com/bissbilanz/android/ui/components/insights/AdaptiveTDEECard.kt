package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.TDEEResult
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import kotlin.math.roundToInt

@Composable
fun AdaptiveTDEECard(result: TDEEResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = "Adaptive TDEE", sectionId = "adaptive_tdee") {
            Text(
                "Not enough data yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "Adaptive TDEE", sectionId = "adaptive_tdee") {
        val tdee = result.estimatedTDEE
        if (tdee == null) {
            Text(
                "Insufficient weight data to estimate TDEE",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                "${tdee.roundToInt()} kcal",
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color = CaloriesBlue,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        val trendColor =
            when (result.trend) {
                "gaining" -> CarbsOrange
                "losing" -> FiberGreen
                else -> CaloriesBlue
            }
        Text(
            result.trend.replaceFirstChar { it.uppercase() },
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = trendColor,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "Avg intake",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "${result.avgIntake.roundToInt()} kcal/day",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "Weekly rate",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val sign = if (result.weeklyRate >= 0) "+" else ""
            Text(
                "${sign}${"%.2f".format(result.weeklyRate)} kg/week",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
