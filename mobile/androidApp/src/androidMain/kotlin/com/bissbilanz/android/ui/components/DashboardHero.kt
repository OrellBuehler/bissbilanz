package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.ui.theme.cardSurface
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.util.formatAsInt

data class MacroTarget(
    val label: String,
    val current: Double,
    val goal: Double,
    val color: Color,
)

@Composable
fun DashboardHeroCard(
    calorieLabel: String,
    calories: Double,
    calorieGoal: Double,
    macros: List<MacroTarget>,
    activityCalories: Int?,
    activityBonus: Int,
    modifier: Modifier = Modifier,
) {
    val tint =
        MaterialTheme.colorScheme.primary
            .copy(alpha = 0.05f)
            .compositeOver(MaterialTheme.cardSurface)
    AppCard(modifier = modifier.fillMaxWidth(), colors = AppCardDefaults.colors(containerColor = tint)) {
        Column(modifier = Modifier.padding(Dimens.CardPadding)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Dimens.CardPadding),
            ) {
                MacroRing(
                    label = calorieLabel,
                    current = calories,
                    goal = calorieGoal,
                    color = CaloriesBlue,
                    size = 124.dp,
                    strokeWidth = 12.dp,
                    showGoal = true,
                    showLabel = false,
                    counterStyle = MaterialTheme.typography.titleLarge,
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Dimens.ListGap + 2.dp)) {
                    Text(
                        calorieLabel,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    macros.forEach { MacroProgressRow(it) }
                }
            }
            if (activityCalories != null && activityCalories > 0) {
                Spacer(modifier = Modifier.height(Dimens.ListGap))
                Text(
                    stringResource(R.string.day_activity_summary, activityCalories),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (activityBonus > 0) {
                    Text(
                        stringResource(R.string.day_activity_goal_bonus, activityBonus),
                        style = MaterialTheme.typography.bodySmall,
                        color = CaloriesBlue.macroTextTone(),
                    )
                }
            }
        }
    }
}

@Composable
private fun MacroProgressRow(target: MacroTarget) {
    val progress = if (target.goal > 0) (target.current / target.goal).toFloat() else 0f
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                target.label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${target.current.formatAsInt()} / ${target.goal.formatAsInt()} g",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = target.color.macroTextTone(),
                maxLines = 1,
            )
        }
        AppProgressBar(progress = progress, color = target.color, height = 6.dp)
    }
}
