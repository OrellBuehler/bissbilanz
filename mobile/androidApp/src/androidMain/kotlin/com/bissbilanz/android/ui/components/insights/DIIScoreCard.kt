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
import com.bissbilanz.analytics.DIIResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed

@Composable
fun DIIScoreCard(result: DIIResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_dii_title), sectionId = "dii_score") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_dii_title), sectionId = "dii_score") {
        val scoreColor = if (result.score < 0) FiberGreen else ProteinRed
        val classificationLabel =
            when (result.classification) {
                "anti-inflammatory", "anti_inflammatory" -> stringResource(R.string.insights_dii_anti_inflammatory)
                "mildly_pro_inflammatory" -> stringResource(R.string.insights_dii_mildly_pro_inflammatory)
                "pro-inflammatory", "pro_inflammatory" -> stringResource(R.string.insights_dii_pro_inflammatory)
                else -> stringResource(R.string.insights_dii_neutral)
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
                    stringResource(R.string.insights_dii_score_label),
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
                stringResource(R.string.insights_dii_top_contributors),
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
                        nutrientDisplayName(contributor.nutrient),
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
