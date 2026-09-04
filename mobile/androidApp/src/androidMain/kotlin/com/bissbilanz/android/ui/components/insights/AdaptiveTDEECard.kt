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
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.TDEEResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.macroTextTone
import kotlin.math.roundToInt

@Composable
fun AdaptiveTDEECard(result: TDEEResult) {
    CollapsibleCard(title = stringResource(R.string.insights_tdee_title), sectionId = "adaptive_tdee") {
        if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
            Text(
                stringResource(R.string.insights_needs_tdee_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val tdee = result.estimatedTDEE
            if (tdee == null) {
                Text(
                    stringResource(R.string.insights_tdee_insufficient_weight_data),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    stringResource(R.string.format_kcal, tdee.roundToInt().toString()),
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = CaloriesBlue.macroTextTone(),
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            val trendColor =
                when (result.trend) {
                    "gain" -> CarbsOrange
                    "loss" -> FiberGreen
                    else -> CaloriesBlue
                }
            val trendLabel =
                when (result.trend) {
                    "gain" -> stringResource(R.string.insights_trend_gain)
                    "loss" -> stringResource(R.string.insights_trend_loss)
                    "maintenance" -> stringResource(R.string.insights_trend_maintenance)
                    else -> result.trend.replaceFirstChar { it.uppercase() }
                }
            Text(
                trendLabel,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = trendColor,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.insights_avg_intake),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    stringResource(R.string.insights_kcal_per_day, result.avgIntake.roundToInt()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.insights_weekly_rate),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val sign = if (result.weeklyRate >= 0) "+" else ""
                Text(
                    stringResource(R.string.insights_kg_per_week, sign, "%.2f".format(result.weeklyRate)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
