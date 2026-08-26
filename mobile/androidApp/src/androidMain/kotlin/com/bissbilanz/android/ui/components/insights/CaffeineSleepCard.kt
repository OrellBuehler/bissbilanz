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
import com.bissbilanz.analytics.CaffeineSleepResult
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.theme.macroTextTone

@Composable
fun CaffeineSleepCard(result: CaffeineSleepResult?) {
    CollapsibleCard(title = stringResource(R.string.insights_caffeine_sleep_title), sectionId = "caffeine_sleep") {
        if (result == null || result.confidence == ConfidenceLevel.INSUFFICIENT) {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        val cutoffHour = result.estimatedCutoffHour
        val cutoffText =
            if (cutoffHour != null) {
                stringResource(R.string.insights_caffeine_cutoff, cutoffHour)
            } else {
                stringResource(R.string.insights_caffeine_no_cutoff)
            }
        Text(
            cutoffText,
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue.macroTextTone(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        result.hourlyImpact.take(8).forEach { impact ->
            val qualityColor =
                when {
                    impact.avgQuality >= 7 -> FiberGreen
                    impact.avgQuality >= 5 -> CarbsOrange
                    else -> ProteinRed
                }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${impact.hour}:00",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "${"%.1f".format(impact.avgQuality)}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = qualityColor,
                )
            }
        }
    }
}
