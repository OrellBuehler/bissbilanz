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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.FoodSleepResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed

@Composable
fun FoodSleepCard(result: FoodSleepResult?) {
    CollapsibleCard(title = stringResource(R.string.insights_food_sleep_title), sectionId = "food_sleep") {
        if (result == null || result.foodImpacts.isEmpty()) {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                stringResource(R.string.insights_overall_avg_quality),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.insights_quality_out_of_10, "%.1f".format(result.overallAvgQuality)),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = CaloriesBlue,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        result.foodImpacts.take(5).forEach { impact ->
            val delta = impact.delta
            val deltaColor = if (delta >= 0) FiberGreen else ProteinRed
            val deltaText = if (delta >= 0) "+${"%.1f".format(delta)}" else "${"%.1f".format(delta)}"
            val label = stringResource(if (delta >= 0) R.string.insights_better_sleep else R.string.insights_worse_sleep)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    impact.foodName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Row {
                    Text(
                        deltaText,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = deltaColor,
                    )
                    Text(
                        " · ${stringResource(R.string.insights_nights_count, label, impact.occurrences)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
