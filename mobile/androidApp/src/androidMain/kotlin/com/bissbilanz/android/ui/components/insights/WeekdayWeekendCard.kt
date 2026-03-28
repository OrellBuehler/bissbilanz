package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.DayStats
import com.bissbilanz.analytics.WeekdayWeekendResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.roundToInt

@Composable
fun WeekdayWeekendCard(result: WeekdayWeekendResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = "Weekday vs Weekend", sectionId = "weekday_weekend") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "Weekday vs Weekend", sectionId = "weekday_weekend") {
        Row(modifier = Modifier.fillMaxWidth()) {
            DayStatsColumn(label = "Weekday", stats = result.weekday, modifier = Modifier.weight(1f))
            Spacer(modifier = Modifier.width(16.dp))
            DayStatsColumn(label = "Weekend", stats = result.weekend, modifier = Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(8.dp))
        val deltaSign = if (result.calorieDelta > 0) "+" else ""
        Text(
            "${deltaSign}${result.calorieDelta.roundToInt()} kcal on weekends (${deltaSign}${result.calorieDeltaPct.roundToInt()}%)",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DayStatsColumn(
    label: String,
    stats: DayStats,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.Start) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(4.dp))
        MacroStatRow(value = "${stats.avgCalories.roundToInt()}", unit = "kcal", color = CaloriesBlue)
        MacroStatRow(value = "${stats.avgProtein.roundToInt()}", unit = "g protein", color = ProteinRed)
        MacroStatRow(value = "${stats.avgCarbs.roundToInt()}", unit = "g carbs", color = CarbsOrange)
        MacroStatRow(value = "${stats.avgFat.roundToInt()}", unit = "g fat", color = FatYellow)
    }
}

@Composable
private fun MacroStatRow(
    value: String,
    unit: String,
    color: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            unit,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
