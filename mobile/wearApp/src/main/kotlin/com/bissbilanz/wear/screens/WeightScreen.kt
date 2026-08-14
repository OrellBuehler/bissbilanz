package com.bissbilanz.wear.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.bissbilanz.wear.R
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearStateRepository
import com.bissbilanz.wear.WearWeightLogRequest
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToInt

/** Latest weight, a 7-day delta, and a stepper to log today's. */
@Composable
fun WeightScreen(
    state: WearState,
    context: Context,
) {
    val scope = rememberCoroutineScope()
    var toast by remember { mutableStateOf<String?>(null) }
    // Seeded from the last known weight so a log is usually two taps away.
    var draft by remember(state.weight?.latestKg) { mutableDoubleStateOf(state.weight?.latestKg ?: 70.0) }

    val loggedLabel = stringResource(R.string.logged)
    val failedLabel = stringResource(R.string.log_failed)

    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text(stringResource(R.string.tab_weight)) } }

        item {
            val latest = state.weight?.latestKg
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text(
                    latest?.let { stringResource(R.string.weight_kg, formatKg(it)) }
                        ?: stringResource(R.string.no_weight),
                    style = MaterialTheme.typography.title2,
                )
                state.weight?.delta7dKg?.let { delta ->
                    Text(
                        stringResource(R.string.delta_7d, formatDelta(delta)),
                        style = MaterialTheme.typography.caption2,
                        color = MaterialTheme.colors.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CompactChip(onClick = { draft = (draft - 0.1).coerceAtLeast(20.0) }, label = { Text("−") })
                Text(formatKg(draft), style = MaterialTheme.typography.title3)
                CompactChip(onClick = { draft = (draft + 0.1).coerceAtMost(400.0) }, label = { Text("+") })
            }
        }

        item {
            Chip(
                onClick = {
                    scope.launch {
                        val ok =
                            WearStateRepository.logWeight(
                                context,
                                WearWeightLogRequest(
                                    weightKg = (draft * 10).roundToInt() / 10.0,
                                    date = LocalDate.now().toString(),
                                ),
                            )
                        toast = if (ok) loggedLabel else failedLabel
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(stringResource(R.string.log_weight)) },
            )
        }

        toast?.let { message ->
            item {
                Text(
                    message,
                    style = MaterialTheme.typography.caption2,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

internal fun formatKg(value: Double): String {
    val rounded = (value * 10).roundToInt() / 10.0
    return rounded.toString()
}

/** Always signed, so a gain and a loss are distinguishable at a glance. */
internal fun formatDelta(value: Double): String {
    val rounded = (abs(value) * 10).roundToInt() / 10.0
    return if (value < 0) "−$rounded" else "+$rounded"
}
