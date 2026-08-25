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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.CalorieCyclingResult
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.macroTextTone
import kotlin.math.roundToInt

@Composable
fun CalorieCyclingCard(result: CalorieCyclingResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_calorie_cycling_title), sectionId = "calorie_cycle") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_calorie_cycling_title), sectionId = "calorie_cycle") {
        val patternColor =
            when (result.pattern) {
                "consistent" -> FiberGreen
                "moderate", "moderate_cycling" -> CaloriesBlue
                else -> CarbsOrange
            }
        val patternLabel =
            when (result.pattern) {
                "consistent" -> {
                    stringResource(R.string.insights_cycling_consistent)
                }

                "moderate", "moderate_cycling" -> {
                    stringResource(R.string.insights_cycling_moderate)
                }

                "high_cycling" -> {
                    stringResource(R.string.insights_cycling_high)
                }

                else -> {
                    result.pattern
                        .replace('_', ' ')
                        .replaceFirstChar { it.uppercase() }
                }
            }
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
                    stringResource(R.string.format_kcal, result.mean.roundToInt().toString()),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = CaloriesBlue.macroTextTone(),
                )
                Text(
                    stringResource(R.string.insights_avg_daily),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column {
                Text(
                    "±${stringResource(R.string.format_kcal, result.stddev.roundToInt().toString())}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    stringResource(R.string.insights_std_deviation),
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
                stringResource(R.string.insights_high_days, result.highDays),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.insights_low_days, result.lowDays),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
