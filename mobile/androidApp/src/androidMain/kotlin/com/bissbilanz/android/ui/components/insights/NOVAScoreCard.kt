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
        CollapsibleCard(title = "NOVA Score", sectionId = "nova_score") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "NOVA Score", sectionId = "nova_score") {
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
                    "ultra-processed",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                "${result.coveragePct.roundToInt()}% tagged",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Based on ${result.sampleSize} food entries (${result.coveragePct.roundToInt()}% tagged)",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        val groupLabels =
            mapOf(
                1 to Pair("Unprocessed / Minimally processed", FiberGreen),
                2 to Pair("Processed culinary ingredients", CaloriesBlue),
                3 to Pair("Processed foods", CarbsOrange),
                4 to Pair("Ultra-processed foods", ProteinRed),
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
                    "NOVA $group · $label",
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
