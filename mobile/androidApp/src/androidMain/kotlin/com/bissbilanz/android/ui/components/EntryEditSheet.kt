package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.android.util.toEditableString
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.EntryUpdate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.EntryField
import com.bissbilanz.util.mealForCurrentTime
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolvedName
import com.bissbilanz.util.toLocalizedDoubleOrNull
import com.bissbilanz.util.toNutrientDoubles
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject
import kotlin.time.Clock
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditSheet(
    entryId: String?,
    date: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    onMoved: (String) -> Unit = {},
    // The caller usually has the entry already; passing it seeds the form on the first frame.
    initialEntry: Entry? = null,
) {
    val entryRepo: EntryRepository = koinInject()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isEditing = entryId != null
    var entry by remember(entryId) { mutableStateOf(initialEntry?.takeIf { it.id == entryId }) }
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    LaunchedEffect(entryId) {
        if (entryId != null && entry == null) {
            // The list may still hold the temp id of an entry whose upload has since
            // swapped it for the server record.
            val currentId = entryRepo.resolveId(entryId)
            val entries = entryRepo.entriesByDate(date ?: today).first()
            val found = entries.find { it.id == currentId }
            if (found != null) entry = found else onDismiss()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        if (isEditing && entry == null) {
            Box(
                modifier = Modifier.fillMaxWidth().heightIn(min = 360.dp).padding(bottom = 32.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            EntryEditForm(entry, entryId, date, sheetState, onDismiss, onSaved, onMoved)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EntryEditForm(
    entry: Entry?,
    entryId: String?,
    date: String?,
    sheetState: SheetState,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    onMoved: (String) -> Unit,
) {
    val entryRepo: EntryRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    var isSaving by remember { mutableStateOf(false) }
    val isEditing = entryId != null
    val preferencesFlow = remember(prefsRepo) { prefsRepo.preferences() }
    val prefs by preferencesFlow.collectAsStateWithLifecycle(null)
    val visibleNutrientKeys = prefs?.visibleNutrients?.toSet()

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    val seedTime =
        entry
            ?.let { it.eatenAt ?: it.createdAt }
            ?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?.toLocalDateTime(TimeZone.currentSystemDefault())

    // Form state, seeded from the entry on the first frame
    var servings by rememberSaveable { mutableStateOf(entry?.servings?.toEditableString() ?: "1") }
    var mealType by rememberSaveable { mutableStateOf(entry?.let { normalizeMealType(it.mealType) } ?: mealForCurrentTime()) }
    var notes by rememberSaveable { mutableStateOf(entry?.notes ?: "") }
    var eatenDate by rememberSaveable { mutableStateOf(entry?.date) }
    var eatenHour by rememberSaveable { mutableStateOf(seedTime?.hour) }
    var eatenMinute by rememberSaveable { mutableStateOf(seedTime?.minute) }
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    var showTimePicker by rememberSaveable { mutableStateOf(false) }
    var quickName by rememberSaveable { mutableStateOf(entry?.quickName ?: "") }
    var quickCalories by rememberSaveable { mutableStateOf(entry?.quickCalories?.toEditableString() ?: "") }
    var quickProtein by rememberSaveable { mutableStateOf(entry?.quickProtein?.toEditableString() ?: "") }
    var quickCarbs by rememberSaveable { mutableStateOf(entry?.quickCarbs?.toEditableString() ?: "") }
    var quickFat by rememberSaveable { mutableStateOf(entry?.quickFat?.toEditableString() ?: "") }
    var quickFiber by rememberSaveable { mutableStateOf(entry?.quickFiber?.toEditableString() ?: "") }
    var quickNutrients by rememberSaveable {
        mutableStateOf<Map<String, String>>(
            entry?.quickNutrients.orEmpty().mapValues { (_, value) -> value.toEditableString() },
        )
    }
    var showDeleteDialog by rememberSaveable { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    // A quick entry carries its own nutrition; a food- or recipe-backed one takes it
    // from the record behind it, which is edited in that record's own sheet.
    val isQuickEntry = entry?.let { it.foodId == null && it.recipeId == null } == true
    val showQuickFields = !isEditing || isQuickEntry
    // The server requires foodId, recipeId or positive quickCalories. For a quick entry
    // that hasn't uploaded yet the edit is merged into the still-queued create
    // (coalesceQueuedCreate); an emptied calorie field would drop quickCalories from
    // that create, the POST would 400, and the sync queue dead-letters client errors,
    // stranding the entry as a local temp_ row forever.
    // The same rule holds for a new quick add, which is always a quick entry.
    val caloriesValid = !showQuickFields || (quickCalories.toLocalizedDoubleOrNull() ?: 0.0) > 0.0
    val servingsValid = !isEditing || (servings.toLocalizedDoubleOrNull() ?: 0.0) > 0.0
    val canSave = caloriesValid && servingsValid
    val unknownName = stringResource(R.string.entry_edit_unknown)
    val deleteFailedMessage = stringResource(R.string.entry_edit_delete_failed)
    val saveFailedMessage = stringResource(R.string.entry_edit_save_failed)
    val selectedDayLabel = dayLabel(LocalDate.parse(eatenDate ?: date ?: today))
    val movedMessage = stringResource(R.string.entry_edit_moved, selectedDayLabel)

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

    if (showDatePicker) {
        val todayMillis = LocalDate.parse(today).toEpochDays().toLong() * 86_400_000L
        val initialMillis =
            eatenDate
                ?.let { runCatching { LocalDate.parse(it).toEpochDays().toLong() * 86_400_000L }.getOrNull() }
                ?: todayMillis
        val dateState =
            rememberDatePickerState(
                initialSelectedDateMillis = initialMillis,
                yearRange = 1900..2100,
            )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        dateState.selectedDateMillis?.let { millis ->
                            eatenDate =
                                Instant
                                    .fromEpochMilliseconds(millis)
                                    .toLocalDateTime(TimeZone.UTC)
                                    .date
                                    .toString()
                        }
                        showDatePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = dateState) }
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

    Column(
        modifier =
            Modifier
                .padding(horizontal = Dimens.SheetHorizontalPadding)
                .padding(bottom = Dimens.SheetBottomPadding)
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

        if (isEditing && entry != null && !isQuickEntry) {
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
        ChoiceDropdown(
            label = stringResource(R.string.entry_edit_meal_type_label),
            selectedLabel = mealTypeDisplayName(mealType),
            options = mealTypes.map { mealTypeDisplayName(it) to it },
            onSelect = { mealType = it },
        )

        // Servings (edit mode)
        if (isEditing) {
            OutlinedTextField(
                value = servings,
                onValueChange = { servings = it },
                label = { Text(stringResource(R.string.meal_picker_servings_label)) },
                isError = !servingsValid,
                supportingText =
                    if (servingsValid) {
                        null
                    } else {
                        { Text(stringResource(R.string.entry_edit_servings_invalid)) }
                    },
                keyboardOptions =
                    KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }

        // Date (edit mode) — lets a wrong-day AI log get moved to the right day.
        if (isEditing) {
            Text(stringResource(R.string.entry_edit_date_label), style = MaterialTheme.typography.labelLarge)
            OutlinedButton(
                onClick = { showDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    Icons.Default.CalendarToday,
                    contentDescription = null,
                    modifier = Modifier.size(ButtonDefaults.IconSize),
                )
                Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                Text(selectedDayLabel)
            }
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
                    modifier = Modifier.size(ButtonDefaults.IconSize),
                )
                Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                Text(formatTimeOfDay(eatenHour, eatenMinute))
            }
        }

        // Quick add fields
        if (showQuickFields) {
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

        if (!caloriesValid) {
            Text(
                stringResource(R.string.entry_edit_calories_required),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (isSaving) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        SheetActionRow {
            OutlinedButton(
                onClick = {
                    scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                },
                modifier = Modifier.weight(1f).fillMaxHeight(),
            ) {
                Text(stringResource(R.string.dialog_cancel), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                                        servings = servings.toLocalizedDoubleOrNull(),
                                        notes = notes.ifBlank { null },
                                        date = eatenDate,
                                        eatenAt =
                                            buildEatenAt(eatenDate, eatenHour, eatenMinute),
                                        quickName =
                                            if (isQuickEntry) quickName.trim().ifBlank { null } else null,
                                        quickCalories =
                                            if (isQuickEntry) quickCalories.toLocalizedDoubleOrNull() else null,
                                        quickProtein =
                                            if (isQuickEntry) quickProtein.toLocalizedDoubleOrNull() else null,
                                        quickCarbs =
                                            if (isQuickEntry) quickCarbs.toLocalizedDoubleOrNull() else null,
                                        quickFat =
                                            if (isQuickEntry) quickFat.toLocalizedDoubleOrNull() else null,
                                        quickFiber =
                                            if (isQuickEntry) quickFiber.toLocalizedDoubleOrNull() else null,
                                        quickNutrients =
                                            if (isQuickEntry) {
                                                quickNutrients.toNutrientDoubles().ifEmpty { null }
                                            } else {
                                                null
                                            },
                                    ),
                                    // A field the user emptied has to travel as an
                                    // explicit clear: `EntryUpdate` encodes both
                                    // "unchanged" and "cleared" as null.
                                    clearedEntryFields(
                                        isQuickEntry = isQuickEntry,
                                        notes = notes,
                                        quickName = quickName,
                                        quickCalories = quickCalories,
                                        quickProtein = quickProtein,
                                        quickCarbs = quickCarbs,
                                        quickFat = quickFat,
                                        quickFiber = quickFiber,
                                        quickNutrients = quickNutrients,
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
                            if (isEditing && eatenDate != null && eatenDate != entry?.date) {
                                onMoved(movedMessage)
                            }
                            onSaved()
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            Log.e("EntryEditSheet", "Failed to save entry", e)
                            errorReporter.captureException(e)
                            errorMessage = saveFailedMessage
                        } finally {
                            isSaving = false
                        }
                    }
                },
                modifier = Modifier.weight(1f).fillMaxHeight(),
                enabled = !isSaving && canSave,
            ) {
                Text(stringResource(R.string.action_save), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

/** Locale-aware short time-of-day (e.g. "1:30 PM" / "13:30"), or a placeholder when unset. */
internal fun formatTimeOfDay(
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
internal fun buildEatenAt(
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

/**
 * The fields the editor is deliberately emptying.
 *
 * A blank input means "remove this value", but the generated `EntryUpdate` cannot tell
 * that apart from "leave it alone" — both are null — so the repository is told
 * explicitly. Quick fields only count for a quick entry: a food- or recipe-backed entry
 * takes its nutrition from the record behind it and never owns them. An unparseable
 * (but non-blank) number is left untouched rather than cleared, matching what the sheet
 * did before: the user is mid-typing, not removing the value.
 */
internal fun clearedEntryFields(
    isQuickEntry: Boolean,
    notes: String,
    quickName: String,
    quickCalories: String,
    quickProtein: String,
    quickCarbs: String,
    quickFat: String,
    quickFiber: String,
    quickNutrients: Map<String, String>,
): Set<EntryField> =
    buildSet {
        if (notes.isBlank()) add(EntryField.NOTES)
        if (!isQuickEntry) return@buildSet
        if (quickName.isBlank()) add(EntryField.QUICK_NAME)
        if (quickCalories.isBlank()) add(EntryField.QUICK_CALORIES)
        if (quickProtein.isBlank()) add(EntryField.QUICK_PROTEIN)
        if (quickCarbs.isBlank()) add(EntryField.QUICK_CARBS)
        if (quickFat.isBlank()) add(EntryField.QUICK_FAT)
        if (quickFiber.isBlank()) add(EntryField.QUICK_FIBER)
        if (quickNutrients.toNutrientDoubles().isEmpty()) add(EntryField.QUICK_NUTRIENTS)
    }
