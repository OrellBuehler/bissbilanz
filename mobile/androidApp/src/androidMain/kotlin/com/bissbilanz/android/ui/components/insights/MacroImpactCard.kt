package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.NutrientCorrelation
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.abs

@Composable
fun MacroImpactCard(correlations: List<NutrientCorrelation>) {
    CollapsibleCard(title = stringResource(R.string.insights_macro_impact_title), sectionId = "macro_impact") {
        val filtered =
            remember(correlations) {
                correlations
                    .filter { it.correlation.confidence != ConfidenceLevel.INSUFFICIENT }
                    .sortedByDescending { abs(it.correlation.r) }
            }
        if (filtered.isEmpty()) {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        filtered.forEach { nc ->
            val r = nc.correlation.r
            val rColor =
                when {
                    abs(r) < 0.3 -> MaterialTheme.colorScheme.onSurfaceVariant
                    abs(r) < 0.5 -> CarbsOrange
                    else -> ProteinRed
                }
            val label = nutrientDisplayName(nc.nutrientKey)
            val arrow = if (r > 0) "↑" else "↓"
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row {
                    Text(
                        "${"%.2f".format(r)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = rColor,
                    )
                    Text(
                        " $arrow ${stringResource(R.string.insights_impact_weight_suffix)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = rColor,
                    )
                }
            }
        }
    }
}
