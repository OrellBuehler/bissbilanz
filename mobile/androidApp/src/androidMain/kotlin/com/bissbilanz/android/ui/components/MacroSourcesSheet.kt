package com.bissbilanz.android.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.ui.viewmodels.MacroSourcesState
import com.bissbilanz.model.DailyStatsEntry
import com.bissbilanz.model.TopFoodEntry
import com.bissbilanz.util.formatAsInt
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlin.math.roundToInt
import kotlin.time.Clock

/** The Macro Balance axes; [key] is the top-foods `sort` value. */
enum class MacroSource(
    val key: String,
    @StringRes val label: Int,
    val color: Color,
) {
    PROTEIN("protein", R.string.macro_protein, ProteinRed),
    CARBS("carbs", R.string.macro_carbs, CarbsOrange),
    FAT("fat", R.string.macro_fat, FatYellow),
    FIBER("fiber", R.string.macro_fiber, FiberGreen),
    ;

    fun of(food: TopFoodEntry): Double =
        when (this) {
            PROTEIN -> food.protein
            CARBS -> food.carbs
            FAT -> food.fat
            FIBER -> food.fiber
        }

    fun of(day: DailyStatsEntry): Double =
        when (this) {
            PROTEIN -> day.protein
            CARBS -> day.carbs
            FAT -> day.fat
            FIBER -> day.fiber
        }
}

/**
 * The foods behind one Macro Balance axis: which ones contributed the most of it over
 * the selected range, and their share of the period's total.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MacroSourcesSheet(
    macro: MacroSource,
    days: Int,
    dailyStats: List<DailyStatsEntry>,
    state: MacroSourcesState,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // Same window as the server's top-foods (today and the days - 1 before it), so
    // the shares line up with the listed totals.
    val cutoff =
        Clock.System
            .todayIn(TimeZone.currentSystemDefault())
            .minus(days - 1, DateTimeUnit.DAY)
            .toString()
    val periodTotal = dailyStats.filter { it.date >= cutoff }.sumOf { macro.of(it) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .navigationBarsPadding(),
        ) {
            Text(
                "${stringResource(R.string.insights_macro_sources_title)}: ${stringResource(macro.label)}",
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                stringResource(R.string.insights_macro_sources_subtitle, days),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))

            when (state) {
                MacroSourcesState.Loading ->
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }

                MacroSourcesState.Failed ->
                    Text(
                        stringResource(R.string.insights_load_failed),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                is MacroSourcesState.Loaded ->
                    if (state.foods.isEmpty()) {
                        Text(
                            stringResource(R.string.insights_macro_sources_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        state.foods.forEachIndexed { i, food ->
                            SourceRow(rank = i + 1, food = food, macro = macro, periodTotal = periodTotal)
                            if (i < state.foods.lastIndex) {
                                HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))
                            }
                        }
                    }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SourceRow(
    rank: Int,
    food: TopFoodEntry,
    macro: MacroSource,
    periodTotal: Double,
) {
    val amount = macro.of(food) * food.count
    val share = if (periodTotal > 0) (amount / periodTotal).coerceIn(0.0, 1.0) else 0.0

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "$rank",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(28.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(food.foodName, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    stringResource(R.string.insights_macro_sources_amount, food.count, amount.formatAsInt()),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${(share * 100).roundToInt()}%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = macro.color.macroTextTone(),
                )
                Text(
                    stringResource(R.string.insights_macro_sources_share),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { share.toFloat() },
            modifier = Modifier.fillMaxWidth().padding(start = 28.dp),
            color = macro.color,
        )
    }
}
