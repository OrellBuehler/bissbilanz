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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.FoodDiversityResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.macroTextTone
import kotlin.math.roundToInt

@Composable
fun FoodDiversityCard(result: FoodDiversityResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_food_diversity_title), sectionId = "food_diversity") {
            Text(
                stringResource(R.string.insights_needs_food_weeks_7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_food_diversity_title), sectionId = "food_diversity") {
        val trendColor =
            when (result.trend) {
                "increasing" -> FiberGreen
                "stable" -> CaloriesBlue
                else -> CarbsOrange
            }
        val trendLabel =
            when (result.trend) {
                "increasing" -> stringResource(R.string.insights_diversity_increasing)
                "stable" -> stringResource(R.string.insights_diversity_stable)
                "decreasing" -> stringResource(R.string.insights_diversity_decreasing)
                else -> result.trend.replaceFirstChar { it.uppercase() }
            }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "${result.avgUniquePerWeek.roundToInt()}",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = CaloriesBlue.macroTextTone(),
                )
                Text(
                    stringResource(R.string.insights_unique_foods_per_week),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                trendLabel,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = trendColor,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            stringResource(R.string.insights_diversity_based_on, result.sampleSize),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
