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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.CaloricLagResult
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue

@Composable
fun CaloricLagCard(result: CaloricLagResult) {
    CollapsibleCard(title = "Caloric Lag", sectionId = "caloric_lag") {
        if (result.bestLag == null) {
            Text(
                "No significant lag pattern found",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@CollapsibleCard
        }
        Text(
            "${result.bestLag} day lag",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue,
        )
        Spacer(modifier = Modifier.height(8.dp))
        result.results.forEach { lagResult ->
            val correlation = lagResult.correlation ?: return@forEach
            val isBest = lagResult.lag == result.bestLag
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "Day ${lagResult.lag}",
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
