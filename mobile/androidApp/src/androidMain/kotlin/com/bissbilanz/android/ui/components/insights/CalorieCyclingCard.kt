package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import com.bissbilanz.analytics.CalorieCyclingResult
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import kotlin.math.roundToInt

@Composable
fun CalorieCyclingCard(result: CalorieCyclingResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = "Calorie Cycling", sectionId = "calorie_cycle") {
            Text(
                "Not enough data yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "Calorie Cycling", sectionId = "calorie_cycle") {
        val patternColor =
            when (result.pattern) {
                "consistent" -> FiberGreen
                "moderate", "moderate_cycling" -> CaloriesBlue
                else -> CarbsOrange
            }
        val patternLabel =
            result.pattern
                .replace('_', ' ')
                .replaceFirstChar { it.uppercase() }
        Text(
            patternLabel,
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = patternColor,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "${result.mean.roundToInt()} kcal",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = CaloriesBlue,
                )
                Text(
                    "avg daily",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column {
                Text(
                    "±${result.stddev.roundToInt()} kcal",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    "std deviation",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "${result.highDays} high days",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "${result.lowDays} low days",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
