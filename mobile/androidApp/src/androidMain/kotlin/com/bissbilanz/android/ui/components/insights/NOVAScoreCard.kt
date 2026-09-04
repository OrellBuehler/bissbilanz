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
import com.bissbilanz.analytics.NOVAResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.roundToInt

@Composable
fun NOVAScoreCard(result: NOVAResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_nova_score_title), sectionId = "nova_score") {
            Text(
                stringResource(R.string.insights_needs_food_entries_7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_nova_score_title), sectionId = "nova_score") {
        val headlineColor =
            when {
                result.ultraProcessedPct < 30 -> FiberGreen
                result.ultraProcessedPct < 50 -> CarbsOrange
                else -> ProteinRed
            }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "${result.ultraProcessedPct.roundToInt()}%",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = headlineColor,
                )
                Text(
                    stringResource(R.string.insights_nova_ultra_processed_label),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                stringResource(R.string.insights_nova_tagged_pct, result.coveragePct.roundToInt()),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            stringResource(R.string.insights_nova_based_on, result.sampleSize, result.coveragePct.roundToInt()),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        val groupLabels =
            mapOf(
                1 to Pair(stringResource(R.string.insights_nova_group_1), FiberGreen),
                2 to Pair(stringResource(R.string.food_detail_nova_2), CaloriesBlue),
                3 to Pair(stringResource(R.string.food_detail_nova_3), CarbsOrange),
                4 to Pair(stringResource(R.string.insights_nova_group_4), ProteinRed),
            )
        val totalKcal = result.groupDistribution.values.sum()
        for (group in 1..4) {
            val kcal = result.groupDistribution[group] ?: continue
            val pct = if (totalKcal > 0) (kcal / totalKcal) * 100.0 else 0.0
            val (label, color) = groupLabels[group] ?: continue
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.insights_nova_row_format, group, label),
                    style = MaterialTheme.typography.bodySmall,
                    color = color,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${pct.roundToInt()}%",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = color,
                )
            }
        }
    }
}
