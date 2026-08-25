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
import com.bissbilanz.analytics.CaloricLagResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.macroTextTone

@Composable
fun CaloricLagCard(result: CaloricLagResult) {
    CollapsibleCard(title = stringResource(R.string.insights_caloric_lag_title), sectionId = "caloric_lag") {
        val bestLag = result.bestLag
        if (bestLag == null) {
            Text(
                stringResource(R.string.insights_caloric_lag_none),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        Text(
            stringResource(R.string.insights_caloric_lag_days, bestLag),
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue.macroTextTone(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        result.results.forEach { lagResult ->
            val correlation = lagResult.correlation ?: return@forEach
            val isBest = lagResult.lag == bestLag
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    stringResource(R.string.insights_caloric_lag_day, lagResult.lag),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (isBest) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (isBest) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "r = ${"%.2f".format(correlation.r)}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (isBest) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (isBest) CaloriesBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
