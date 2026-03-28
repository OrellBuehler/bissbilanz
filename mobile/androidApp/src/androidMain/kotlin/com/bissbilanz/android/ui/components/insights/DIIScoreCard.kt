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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.DIIResult
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed

@Composable
fun DIIScoreCard(result: DIIResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = "Dietary Inflammatory Index", sectionId = "dii_score") {
            Text(
                "Not enough data yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = "Dietary Inflammatory Index", sectionId = "dii_score") {
        val scoreColor = if (result.score < 0) FiberGreen else ProteinRed
        val classificationLabel =
            when (result.classification) {
                "anti-inflammatory", "anti_inflammatory" -> "Anti-inflammatory"
                "mildly_pro_inflammatory" -> "Mildly pro-inflammatory"
                "pro-inflammatory", "pro_inflammatory" -> "Pro-inflammatory"
                else -> "Neutral"
            }
        val classificationColor =
            when (result.classification) {
                "anti-inflammatory", "anti_inflammatory" -> FiberGreen
                "mildly_pro_inflammatory" -> CarbsOrange
                "pro-inflammatory", "pro_inflammatory" -> ProteinRed
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "%.1f".format(result.score),
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = scoreColor,
                )
                Text(
                    "DII score",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                classificationLabel,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = classificationColor,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        if (result.contributors.isNotEmpty()) {
            Text(
                "Top contributors",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(modifier = Modifier.height(4.dp))
            result.contributors.take(3).forEach { contributor ->
                val impactColor = if (contributor.impact < 0) FiberGreen else ProteinRed
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        contributor.nutrient.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "${if (contributor.impact > 0) "+" else ""}${"%.2f".format(contributor.impact)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = impactColor,
                    )
                }
            }
        }
    }
}
