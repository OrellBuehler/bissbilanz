package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.NutrientCorrelation
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import kotlin.math.abs

@Composable
fun NutrientSleepCard(correlations: List<NutrientCorrelation>) {
    CollapsibleCard(title = "Nutrients & Sleep", sectionId = "nutrient_sleep") {
        val filtered =
            correlations
                .filter { it.correlation.confidence != ConfidenceLevel.INSUFFICIENT }
                .sortedByDescending { abs(it.correlation.r) }
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
            val rColor = if (r >= 0) FiberGreen else ProteinRed
            val direction = if (r >= 0) "↑ sleep quality" else "↓ sleep quality"
            val label =
                when (nc.nutrientKey) {
                    "protein" -> "Protein"
                    "carbs" -> "Carbs"
                    "fat" -> "Fat"
                    "fiber" -> "Fiber"
                    else -> nc.nutrientKey.replaceFirstChar { it.uppercase() }
                }
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
                        " $direction",
                        style = MaterialTheme.typography.bodySmall,
                        color = rColor,
                    )
                }
            }
        }
    }
}
