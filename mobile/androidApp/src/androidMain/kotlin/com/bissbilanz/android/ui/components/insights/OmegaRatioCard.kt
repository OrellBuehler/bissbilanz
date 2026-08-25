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
import com.bissbilanz.analytics.OmegaResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.theme.macroTextTone

@Composable
fun OmegaRatioCard(result: OmegaResult) {
    CollapsibleCard(title = stringResource(R.string.insights_omega_ratio_title), sectionId = "omega_ratio") {
        if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        val statusColor =
            when (result.status) {
                "optimal" -> FiberGreen
                "elevated" -> CaloriesBlue
                "high" -> CarbsOrange
                else -> ProteinRed
            }
        val statusLabel =
            when (result.status) {
                "optimal" -> stringResource(R.string.insights_omega_optimal)
                "elevated" -> stringResource(R.string.insights_omega_elevated)
                "high" -> stringResource(R.string.insights_omega_high)
                else -> stringResource(R.string.insights_omega_critical)
            }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    "${"%.1f".format(result.ratio)}:1",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = statusColor,
                )
                Text(
                    stringResource(R.string.insights_omega_ratio_label),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                statusLabel,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = statusColor,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    stringResource(R.string.insights_grams_per_day, "%.1f".format(result.avgOmega3)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = FiberGreen.macroTextTone(),
                )
                Text(
                    stringResource(R.string.nutrient_omega3),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    stringResource(R.string.insights_grams_per_day, "%.1f".format(result.avgOmega6)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = CarbsOrange.macroTextTone(),
                )
                Text(
                    stringResource(R.string.nutrient_omega6),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            stringResource(R.string.insights_omega_ideal_ratio),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
