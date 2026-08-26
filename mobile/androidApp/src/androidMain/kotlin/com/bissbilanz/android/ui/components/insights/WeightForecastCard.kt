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
import com.bissbilanz.analytics.WeightForecast
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.macroTextTone

@Composable
fun WeightForecastCard(result: WeightForecast) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_weight_forecast_title), sectionId = "weight_forecast") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_weight_forecast_title), sectionId = "weight_forecast") {
        if (result.currentWeight == null) {
            Text(
                stringResource(R.string.insights_no_recent_weight_entries),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        Text(
            stringResource(R.string.weight_kg_value, "%.1f".format(result.currentWeight)),
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue.macroTextTone(),
        )
        val sign = if (result.weeklyRate >= 0) "+" else ""
        Text(
            stringResource(R.string.insights_kg_per_week, sign, "%.2f".format(result.weeklyRate)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        ForecastRow(label = stringResource(R.string.insights_forecast_30_days), value = result.day30)
        ForecastRow(label = stringResource(R.string.insights_forecast_60_days), value = result.day60)
        ForecastRow(label = stringResource(R.string.insights_forecast_90_days), value = result.day90)
    }
}

@Composable
private fun ForecastRow(
    label: String,
    value: Double?,
) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            if (value != null) stringResource(R.string.weight_kg_value, "%.1f".format(value)) else "—",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
