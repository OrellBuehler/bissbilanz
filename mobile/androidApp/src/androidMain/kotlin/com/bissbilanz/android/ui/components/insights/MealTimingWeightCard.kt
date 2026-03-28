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
import com.bissbilanz.analytics.MealTimingSummary
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import kotlin.math.roundToInt

@Composable
fun MealTimingWeightCard(summary: MealTimingSummary?) {
    CollapsibleCard(title = "Meal Timing", sectionId = "meal_timing_weight") {
        if (summary == null) {
            Text(
                "Not enough data yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        Text(
            "${(summary.avgWindowMinutes / 60).roundToInt()}h window",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue,
        )
        Text(
            "avg eating window",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "First meal",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                summary.avgFirstMealTime,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "Last meal",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                summary.avgLastMealTime,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            "${(summary.lateNightFrequency * 100).roundToInt()}% of days with late-night meals",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
