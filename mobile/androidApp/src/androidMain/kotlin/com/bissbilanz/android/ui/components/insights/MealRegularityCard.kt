package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Arrangement
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
import com.bissbilanz.analytics.MealRegularityResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.roundToInt

@Composable
fun MealRegularityCard(result: MealRegularityResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_meal_regularity_title), sectionId = "meal_regularity") {
            Text(
                stringResource(R.string.insights_needs_timed_food_days_7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_meal_regularity_title), sectionId = "meal_regularity") {
        Text(
            "${result.overallScore.roundToInt()}/100",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color =
                when {
                    result.overallScore >= 70 -> FiberGreen
                    result.overallScore >= 40 -> CarbsOrange
                    else -> ProteinRed
                },
        )
        Text(
            stringResource(R.string.insights_overall_regularity_score),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        result.meals.forEach { meal ->
            val regularityColor =
                when (meal.regularity) {
                    "high" -> FiberGreen
                    "medium" -> CarbsOrange
                    else -> ProteinRed
                }
            val regularityLabel =
                when (meal.regularity) {
                    "high" -> stringResource(R.string.insights_regularity_high)
                    "medium" -> stringResource(R.string.insights_regularity_medium)
                    "low" -> stringResource(R.string.insights_regularity_low)
                    else -> meal.regularity.replaceFirstChar { it.uppercase() }
                }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    meal.mealType.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    regularityLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = regularityColor,
                )
            }
        }
    }
}
