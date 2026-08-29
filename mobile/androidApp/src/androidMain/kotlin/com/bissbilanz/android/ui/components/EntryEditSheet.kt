package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.EntryUpdate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolvedName
import com.bissbilanz.util.toDisplayString
import com.bissbilanz.util.toLocalizedDoubleOrNull
import com.bissbilanz.util.toNutrientDoubles
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditSheet(
    entryId: String?,
    date: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val entryRepo: EntryRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isSaving by remember { mutableStateOf(false) }
    var entry by remember { mutableStateOf<Entry?>(null) }
    val isEditing = entryId != null
    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(null)
    val visibleNutrientKeys = prefs?.visibleNutrients?.toSet()

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    // Form state
    var servings by remember { mutableStateOf("1") }
    var mealType by remember { mutableStateOf("Lunch") }
    var notes by remember { mutableStateOf("") }
    var eatenHour by remember { mutableStateOf<Int?>(null) }
    var eatenMinute by remember { mutableStateOf<Int?>(null) }
    var showTimePicker by remember { mutableStateOf(false) }
    var quickName by remember { mutableStateOf("") }
    var quickCalories by remember { mutableStateOf("") }
    var quickProtein by remember { mutableStateOf("") }
    var quickCarbs by remember { mutableStateOf("") }
    var quickFat by remember { mutableStateOf("") }
    var quickFiber by remember { mutableStateOf("") }
    var quickNutrients by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val unknownName = stringResource(R.string.entry_edit_unknown)
    val deleteFailedMessage = stringResource(R.string.entry_edit_delete_failed)
    val saveFailedMessage = stringResource(R.string.entry_edit_save_failed)

    LaunchedEffect(entryId) {
        if (entryId != null) {
            val entries = entryRepo.entriesByDate(date ?: today).first()
            val found = entries.find { it.id == entryId }
            if (found != null) {
                entry = found
                servings = found.servings.toDisplayString()
                mealType = normalizeMealType(found.mealType)
                notes = found.notes ?: ""
                val seed =
                    (found.eatenAt ?: found.createdAt)
                        ?.let { runCatching { Instant.parse(it) }.getOrNull() }
                        ?.toLocalDateTime(TimeZone.currentSystemDefault())
                eatenHour = seed?.hour
                eatenMinute = seed?.minute
            }
        }
    }

    if (showDeleteDialog && entry != null) {
        val name = entry?.resolvedName() ?: unknownName
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.entry_edit_delete_title)) },
            text = { Text(stringResource(R.string.entry_edit_delete_text, name)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        val entryId = entry?.id ?: return@TextButton
                        scope.launch {
                            try {
                                entryRepo.deleteEntry(entryId)
                                showDeleteDialog = false
                                sheetState.hide()
                                onSaved()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Log.e("EntryEditSheet", "Failed to delete entry", e)
                                errorReporter.captureException(e)
                                showDeleteDialog = false
                                errorMessage = deleteFailedMessage
                            }
                        }
                    },
                    colors =
                        ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                ) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        )
    }

    if (showTimePicker) {
        val tz = TimeZone.currentSystemDefault()
        val nowLocal = Clock.System.now().toLocalDateTime(tz)
        val timeState =
            rememberTimePickerState(
                initialHour = eatenHour ?: nowLocal.hour,
                initialMinute = eatenMinute ?: nowLocal.minute,
            )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        eatenHour = timeState.hour
                        eatenMinute = timeState.minute
                        showTimePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
            text = {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TimePicker(state = timeState)
                }
            },
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp)
                    .imePadding()
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    if (isEditing) stringResource(R.string.entry_edit_title) else stringResource(R.string.entry_edit_quick_add_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                if (isEditing && entry != null) {
                    IconButton(onClick = { showDeleteDialog = true }) {
                        Icon(
                            Icons.Default.Delete,
                            stringResource(R.string.action_delete),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            if (isEditing && entry != null) {
                val name = entry?.resolvedName() ?: unknownName
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        entry?.food?.brand?.let {
                            Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            // Meal type
            Text(stringResource(R.string.entry_edit_meal_type_label), style = MaterialTheme.typography.labelLarge)
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                mealTypes.forEachIndexed { index, option ->
                    SegmentedButton(
                        shape =
                            SegmentedButtonDefaults.itemShape(
                                index,
                                mealTypes.size,
                            ),
                        onClick = { mealType = option },
                        selected = mealType == option,
                    ) {
                        Text(mealTypeDisplayName(option))
                    }
                }
            }

            // Servings (edit mode)
            if (isEditing) {
                OutlinedTextField(
                    value = servings,
                    onValueChange = { servings = it },
                    label = { Text(stringResource(R.string.meal_picker_servings_label)) },
                    keyboardOptions =
                        KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            // Time (edit mode)
            if (isEditing) {
                Text(stringResource(R.string.entry_edit_time_label), style = MaterialTheme.typography.labelLarge)
                OutlinedButton(
                    onClick = { showTimePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(formatTimeOfDay(eatenHour, eatenMinute))
                }
            }

            // Quick add fields
            if (!isEditing) {
                OutlinedTextField(
                    value = quickName,
                    onValueChange = { quickName = it },
                    label = { Text(stringResource(R.string.food_form_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                NutrientTextField(stringResource(R.string.add_food_quick_calories), quickCalories, CaloriesBlue) {
                    quickCalories = it
                }
                NutrientTextField(stringResource(R.string.add_food_quick_protein), quickProtein, ProteinRed) {
                    quickProtein = it
                }
                NutrientTextField(stringResource(R.string.add_food_quick_carbs), quickCarbs, CarbsOrange) {
                    quickCarbs = it
                }
                NutrientTextField(stringResource(R.string.add_food_quick_fat), quickFat, FatYellow) { quickFat = it }
                NutrientTextField(stringResource(R.string.food_form_fiber_optional), quickFiber, FiberGreen) {
                    quickFiber = it
                }
                QuickNutrientInputs(
                    nutrients = quickNutrients,
                    onNutrientsChange = { quickNutrients = it },
                    visibleNutrientKeys = visibleNutrientKeys,
                )
            }

            // Notes
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text(stringResource(R.string.weight_notes_label)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
            )

            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            if (isSaving) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(R.string.dialog_cancel))
                }
                Button(
                    onClick = {
                        isSaving = true
                        scope.launch {
                            try {
                                if (isEditing) {
                                    val id = entry?.id ?: return@launch
                                    entryRepo.updateEntry(
                                        id,
                                        EntryUpdate(
                                            mealType = mealType,
                                            servings =
                                                servings.toLocalizedDoubleOrNull() ?: 1.0,
                                            notes = notes.ifBlank { null },
                                            eatenAt =
                                                buildEatenAt(entry?.date, eatenHour, eatenMinute),
                                        ),
                                    )
                                } else {
                                    entryRepo.createEntry(
                                        EntryCreate(
                                            mealType = mealType,
                                            servings = 1.0,
                                            date = date ?: today,
                                            quickName =
                                                quickName.trim().ifBlank { null },
                                            quickCalories =
                                                quickCalories.toLocalizedDoubleOrNull(),
                                            quickProtein =
                                                quickProtein.toLocalizedDoubleOrNull(),
                                            quickCarbs =
                                                quickCarbs.toLocalizedDoubleOrNull(),
                                            quickFat = quickFat.toLocalizedDoubleOrNull(),
                                            quickFiber =
                                                quickFiber.toLocalizedDoubleOrNull(),
                                            quickNutrients =
                                                quickNutrients.toNutrientDoubles().ifEmpty { null },
                                            notes = notes.ifBlank { null },
                                        ),
                                    )
                                }
                                sheetState.hide()
                                onSaved()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                Log.e("EntryEditSheet", "Failed to save entry", e)
                                errorReporter.captureException(e)
                                errorMessage = saveFailedMessage
                            }
                            isSaving = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isSaving,
                ) {
                    Text(stringResource(R.string.weight_save))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

/** Locale-aware short time-of-day (e.g. "1:30 PM" / "13:30"), or a placeholder when unset. */
private fun formatTimeOfDay(
    hour: Int?,
    minute: Int?,
): String {
    if (hour == null || minute == null) return "--:--"
    return java.time.LocalTime
        .of(hour, minute)
        .format(
            java.time.format.DateTimeFormatter
                .ofLocalizedTime(java.time.format.FormatStyle.SHORT),
        )
}

/**
 * Combines the entry's [date] (yyyy-MM-dd) with the picked [hour]/[minute] in the device
 * timezone and serializes it to a UTC ISO-8601 `eatenAt` instant. The day is preserved from
 * [date] so editing the time never moves the entry to another day. Returns null when any
 * input is missing, in which case the server keeps the existing eaten time.
 */
private fun buildEatenAt(
    date: String?,
    hour: Int?,
    minute: Int?,
): String? {
    if (date.isNullOrBlank() || hour == null || minute == null) return null
    val localDate = runCatching { LocalDate.parse(date) }.getOrNull() ?: return null
    val tz = TimeZone.currentSystemDefault()
    return LocalDateTime(localDate, LocalTime(hour, minute))
        .toInstant(tz)
        .toString()
}
