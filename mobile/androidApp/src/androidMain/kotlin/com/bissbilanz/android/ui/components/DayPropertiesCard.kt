package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import kotlinx.coroutines.delay

/**
 * Water tracking, an informational activity-calorie entry, and an autosaving notes
 * field for the day — the mobile counterpart of the web `DayPropertiesCard`. Always
 * visible on the day log, independent of the fasting-day toggle card.
 *
 * Activity calories are informational only: they are never subtracted from the
 * calorie goal and never feed maintenance/TDEE calculations, matching the web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayPropertiesCard(
    notes: String,
    waterMl: Int?,
    waterGoalMl: Int,
    activityCalories: Int?,
    activityNote: String?,
    onAddWater: (Int) -> Unit,
    onSetWater: (Int?) -> Unit,
    onClearWater: () -> Unit,
    onSetActivity: (Int?, String?) -> Unit,
    onClearActivity: () -> Unit,
    onNotesChanged: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            WaterSection(waterMl, waterGoalMl, onAddWater, onSetWater, onClearWater)

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            ActivitySection(activityCalories, activityNote, onSetActivity, onClearActivity)

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            NotesSection(notes, onNotesChanged)
        }
    }
}

@Composable
private fun WaterSection(
    waterMl: Int?,
    waterGoalMl: Int,
    onAddWater: (Int) -> Unit,
    onSetWater: (Int?) -> Unit,
    onClearWater: () -> Unit,
) {
    val current = waterMl ?: 0
    var draft by remember(waterMl) { mutableStateOf(waterMl?.toString() ?: "") }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.WaterDrop, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            stringResource(R.string.day_water_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        Text(
            stringResource(R.string.day_water_progress, current, waterGoalMl),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (waterMl != null) {
            IconButton(onClick = onClearWater) {
                Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.day_water_clear))
            }
        }
    }
    Spacer(modifier = Modifier.height(8.dp))
    LinearProgressIndicator(
        progress = { (current.toFloat() / waterGoalMl.coerceAtLeast(1)).coerceIn(0f, 1f) },
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(modifier = Modifier.height(12.dp))
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(onClick = { onAddWater(250) }) { Text(stringResource(R.string.day_water_add, 250)) }
        OutlinedButton(onClick = { onAddWater(500) }) { Text(stringResource(R.string.day_water_add, 500)) }
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            label = { Text(stringResource(R.string.day_water_input_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier =
                Modifier.weight(1f).onFocusChanged { focus ->
                    if (!focus.isFocused) onSetWater(draft.toIntOrNull())
                },
        )
    }
}

@Composable
private fun ActivitySection(
    activityCalories: Int?,
    activityNote: String?,
    onSetActivity: (Int?, String?) -> Unit,
    onClearActivity: () -> Unit,
) {
    var caloriesDraft by remember(activityCalories) { mutableStateOf(activityCalories?.toString() ?: "") }
    var noteDraft by remember(activityNote) { mutableStateOf(activityNote ?: "") }

    fun commit() {
        onSetActivity(caloriesDraft.toIntOrNull(), noteDraft)
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.DirectionsRun, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            stringResource(R.string.day_activity_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        if (activityCalories != null || !activityNote.isNullOrBlank()) {
            IconButton(onClick = onClearActivity) {
                Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.day_activity_clear))
            }
        }
    }
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedTextField(
        value = caloriesDraft,
        onValueChange = { caloriesDraft = it },
        label = { Text(stringResource(R.string.day_activity_calories_label)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier =
            Modifier.fillMaxWidth().onFocusChanged { focus ->
                if (!focus.isFocused) commit()
            },
    )
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedTextField(
        value = noteDraft,
        onValueChange = { noteDraft = it },
        label = { Text(stringResource(R.string.day_activity_note_label)) },
        singleLine = true,
        modifier =
            Modifier.fillMaxWidth().onFocusChanged { focus ->
                if (!focus.isFocused) commit()
            },
    )
}

/** Debounces edits 1200ms and always saves on blur, matching the web notes field. */
@Composable
private fun NotesSection(
    notes: String,
    onNotesChanged: (String) -> Unit,
) {
    var draft by remember(notes) { mutableStateOf(notes) }

    LaunchedEffect(draft) {
        if (draft == notes) return@LaunchedEffect
        delay(1200)
        onNotesChanged(draft)
    }

    Text(
        stringResource(R.string.day_notes_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
    )
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedTextField(
        value = draft,
        onValueChange = { draft = it },
        placeholder = { Text(stringResource(R.string.day_notes_placeholder)) },
        modifier =
            Modifier.fillMaxWidth().onFocusChanged { focus ->
                if (!focus.isFocused && draft != notes) onNotesChanged(draft)
            },
        minLines = 2,
    )
}
