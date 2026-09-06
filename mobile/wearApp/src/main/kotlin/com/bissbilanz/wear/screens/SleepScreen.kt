package com.bissbilanz.wear.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.bissbilanz.wear.WearSendResult
import com.bissbilanz.wear.WearSleepLogRequest
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearStateRepository
import com.bissbilanz.wear.wearString
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID
import kotlin.math.roundToInt

/** Last night at a glance, plus a coarse hours/quality logger. */
@Composable
fun SleepScreen(
    state: WearState,
    context: Context,
) {
    val scope = rememberCoroutineScope()
    var outcome by remember { mutableStateOf<WearSendResult?>(null) }
    var hours by remember { mutableDoubleStateOf(8.0) }
    var quality by remember { mutableIntStateOf(7) }

    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text(wearString(R.string.tab_sleep)) } }

        item {
            val sleep = state.sleep
            Text(
                if (sleep == null) {
                    wearString(R.string.no_sleep)
                } else {
                    wearString(
                        R.string.sleep_summary,
                        formatHours(sleep.durationMinutes / 60.0),
                        sleep.quality.roundToInt().toString(),
                    )
                },
                style = MaterialTheme.typography.body2,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        item { StepperLabel(wearString(R.string.hours)) }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CompactChip(onClick = { hours = (hours - 0.5).coerceAtLeast(0.5) }, label = { Text("−") })
                Text("${formatHours(hours)}h", style = MaterialTheme.typography.title3)
                CompactChip(onClick = { hours = (hours + 0.5).coerceAtMost(24.0) }, label = { Text("+") })
            }
        }

        item { StepperLabel(wearString(R.string.quality)) }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CompactChip(onClick = { quality = (quality - 1).coerceAtLeast(1) }, label = { Text("−") })
                Text("$quality/10", style = MaterialTheme.typography.title3)
                CompactChip(onClick = { quality = (quality + 1).coerceAtMost(10) }, label = { Text("+") })
            }
        }

        item {
            Chip(
                onClick = {
                    scope.launch {
                        outcome =
                            WearStateRepository.logSleep(
                                context,
                                WearSleepLogRequest(
                                    durationMinutes = (hours * 60).roundToInt(),
                                    quality = quality.toDouble(),
                                    date = LocalDate.now().toString(),
                                    requestId = UUID.randomUUID().toString(),
                                ),
                            )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(wearString(R.string.log_sleep)) },
            )
        }

        outcome?.let { result ->
            item { StatusLine(outcomeMessage(result)) }
        }
    }
}

@Composable
private fun StepperLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.caption2,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

internal fun formatHours(value: Double): String {
    val rounded = (value * 10).roundToInt() / 10.0
    return if (rounded == rounded.roundToInt().toDouble()) rounded.roundToInt().toString() else rounded.toString()
}
