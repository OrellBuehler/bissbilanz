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
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.ProteinDistributionResult
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.roundToInt

@Composable
fun ProteinDistributionCard(result: ProteinDistributionResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = "Protein Distribution", sectionId = "protein_dist") {
            Text(
                "Not enough data yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "Protein Distribution", sectionId = "protein_dist") {
        val scoreColor =
            when {
                result.score >= 70 -> FiberGreen
                result.score >= 40 -> CarbsOrange
                else -> ProteinRed
            }
        Text(
            "${result.score.roundToInt()}/100",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = scoreColor,
        )
        Text(
            "distribution score",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "${"%.1f".format(result.avgPerMeal)} g",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ProteinRed,
                )
                Text(
                    "avg per meal",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column {
                Text(
                    "${result.mealsBelowThreshold} / ${result.totalMeals}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = CarbsOrange,
                )
                Text(
                    "meals below threshold",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
