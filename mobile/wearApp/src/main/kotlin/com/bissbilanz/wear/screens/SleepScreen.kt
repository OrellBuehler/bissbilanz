package com.bissbilanz.wear.screens

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.hierarchicalFocusGroup
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
    var sending by remember { mutableStateOf(false) }
    var hours by remember { mutableDoubleStateOf(8.0) }
    var quality by remember { mutableIntStateOf(7) }
    // Which value the crown steps; tapping the other one moves it there, the
    // way the Apple Watch's sleep logger moves Digital Crown focus.
    var crownField by remember { mutableStateOf(SleepField.HOURS) }

    val listState = rememberScalingLazyListState()
    // The crown steps a value, as on the Apple Watch, so the list leaves it alone.
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize(), rotaryScrollableBehavior = null) {
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
            SleepStepperRow(
                value = "${formatHours(hours)}h",
                crownActive = crownField == SleepField.HOURS,
                onSelect = { crownField = SleepField.HOURS },
                onStep = { steps -> hours = stepHours(hours, steps) },
            )
        }

        item { StepperLabel(wearString(R.string.quality)) }

        item {
            SleepStepperRow(
                value = "$quality/10",
                crownActive = crownField == SleepField.QUALITY,
                onSelect = { crownField = SleepField.QUALITY },
                onStep = { steps -> quality = (quality + steps).coerceIn(1, 10) },
            )
        }

        item {
            Chip(
                onClick = {
                    // Held for the whole send: a second tap makes a second entry
                    // under its own request id, which nothing can deduplicate.
                    if (!sending) {
                        sending = true
                        scope.launch {
                            try {
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
                            } finally {
                                sending = false
                            }
                        }
                    }
                },
                enabled = !sending,
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(wearString(if (sending) R.string.sending else R.string.log_sleep)) },
            )
        }

        outcome?.let { result ->
            item { StatusLine(outcomeMessage(result)) }
        }
    }
}

private enum class SleepField { HOURS, QUALITY }

/**
 * A −/+ stepper whose value the crown also steps while [crownActive]. Only the
 * active row's focus group is live, so the crown drives exactly one value.
 */
@Composable
private fun SleepStepperRow(
    value: String,
    crownActive: Boolean,
    onSelect: () -> Unit,
    onStep: (Int) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .hierarchicalFocusGroup(active = crownActive)
                .rotaryStepper(onStep),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompactChip(
            onClick = {
                onSelect()
                onStep(-1)
            },
            label = { Text("−") },
        )
        Text(
            value,
            style = MaterialTheme.typography.title3,
            color = if (crownActive) MaterialTheme.colors.primary else MaterialTheme.colors.onSurface,
            modifier = Modifier.clickable(onClick = onSelect),
        )
        CompactChip(
            onClick = {
                onSelect()
                onStep(1)
            },
            label = { Text("+") },
        )
    }
}

/** [value] moved by [steps] half hours, kept within 0.5–24 h (the server caps a night at 1440 minutes). */
internal fun stepHours(
    value: Double,
    steps: Int,
): Double = (value + steps * 0.5).coerceIn(0.5, 24.0)

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
