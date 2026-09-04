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
import com.bissbilanz.analytics.PlateauResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import kotlin.math.roundToInt

@Composable
fun PlateauDetectionCard(result: PlateauResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_plateau_title), sectionId = "plateau_detect") {
            Text(
                stringResource(R.string.insights_needs_weigh_ins_7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_plateau_title), sectionId = "plateau_detect") {
        Text(
            stringResource(if (result.isPlateaued) R.string.insights_plateau_detected else R.string.insights_plateau_none),
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = if (result.isPlateaued) CarbsOrange else FiberGreen,
        )
        Spacer(modifier = Modifier.height(4.dp))
        val causeLabel =
            when (result.cause) {
                "intake_variance" -> stringResource(R.string.insights_plateau_cause_intake_variance)
                "water_retention" -> stringResource(R.string.insights_plateau_cause_water_retention)
                "adaptive_metabolism" -> stringResource(R.string.insights_plateau_cause_adaptive_metabolism)
                else -> stringResource(R.string.insights_plateau_cause_none)
            }
        Text(
            causeLabel,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                stringResource(R.string.insights_plateau_days),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "${result.plateauDays}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        val deficit = result.estimatedDeficit
        if (deficit != null) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.insights_plateau_est_deficit),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    stringResource(R.string.insights_kcal_per_day, deficit.roundToInt()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
