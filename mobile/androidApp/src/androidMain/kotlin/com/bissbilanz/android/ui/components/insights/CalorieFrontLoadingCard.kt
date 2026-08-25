package com.bissbilanz.android.ui.components.insights

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.analytics.ConfidenceLevel
import com.bissbilanz.analytics.FrontLoadingResult
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.macroTextTone
import kotlin.math.roundToInt

@Composable
fun CalorieFrontLoadingCard(result: FrontLoadingResult) {
    if (result.confidence == ConfidenceLevel.INSUFFICIENT) {
        CollapsibleCard(title = stringResource(R.string.insights_front_loading_title), sectionId = "calorie_front") {
            Text(
                stringResource(R.string.insights_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    CollapsibleCard(title = stringResource(R.string.insights_front_loading_title), sectionId = "calorie_front") {
        Text(
            "${result.avgMorningPct.roundToInt()}%",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = CaloriesBlue.macroTextTone(),
        )
        Text(
            stringResource(R.string.insights_front_loading_before_2pm),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            stringResource(R.string.insights_front_loading_days, result.daysAbove50Pct, result.totalDays),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
