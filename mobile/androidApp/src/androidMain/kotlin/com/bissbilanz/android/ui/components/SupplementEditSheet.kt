package com.bissbilanz.android.ui.components

import android.Manifest
import android.app.TimePickerDialog
import android.os.Build
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.reminders.SupplementReminderNotifier
import com.bissbilanz.android.ui.openNotificationSettings
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.model.*
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.util.SupplementSchedule
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.koin.compose.koinInject
import com.bissbilanz.api.generated.model.SupplementCreate as GenSupplementCreate

private data class SupplementIngredientRow(
    val name: String = "",
    val dosage: String = "",
    val dosageUnit: String = "mg",
    // Original ingredientsText preserved when it's not a simple "<number> <unit>" label,
    // so edits round-trip without losing richer free-form text.
    val originalText: String? = null,
)

// Parses "42 mg" out of an existing ingredientsText so it round-trips. Returns
// a non-null unit when the text is ENTIRELY "<number> <unit>" — otherwise we
// preserve the original verbatim to avoid lossy rebuilds.
private fun parseDosage(text: String?): Triple<Double?, String, String?> {
    if (text.isNullOrBlank()) return Triple(null, "mg", null)
    val match =
        Regex("""^\s*([\d.]+)\s*(\S+)\s*$""").matchEntire(text)
            ?: return Triple(null, "mg", text)
    val n =
        match.groupValues[1].toDoubleOrNull()
            ?: return Triple(null, "mg", text)
    return Triple(n, match.groupValues[2], null)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementEditSheet(
    supplementId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val supplementRepo: SupplementRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isLoading by remember { mutableStateOf(supplementId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val isEditing = supplementId != null

    var name by remember { mutableStateOf("") }
    var scheduleType by remember { mutableStateOf(ScheduleType.daily) }
    var timeOfDay by remember { mutableStateOf("morning") }
    var reminderTimes by remember { mutableStateOf(listOf<String>()) }
    var isActive by remember { mutableStateOf(true) }

    // Always at least one ingredient — matches server's minItems: 1 rule.
    var ingredients by remember {
        mutableStateOf(listOf(SupplementIngredientRow()))
    }

    val loadFailedMessage = stringResource(R.string.supplement_edit_load_failed)
    val saveFailedMessage = stringResource(R.string.supplement_edit_save_failed)

    LaunchedEffect(supplementId) {
        if (supplementId != null) {
            try {
                val supplements = supplementRepo.supplements().first()
                val found = supplements.find { it.id == supplementId }
                if (found != null) {
                    name = found.name
                    scheduleType = found.scheduleType
                    timeOfDay = found.timeOfDay?.value ?: "morning"
                    reminderTimes = found.reminderTimes.orEmpty()
                    isActive = found.isActive
                    val rows =
                        found.ingredients.map { ing ->
                            val (dose, unit, original) = parseDosage(ing.food.ingredientsText)
                            SupplementIngredientRow(
                                name = ing.food.name,
                                dosage = dose?.toString().orEmpty(),
                                dosageUnit = unit,
                                originalText = original,
                            )
                        }
                    ingredients = rows.ifEmpty { listOf(SupplementIngredientRow()) }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e("SupplementEditSheet", "Failed to load supplement", e)
                errorReporter.captureException(e)
                errorMessage = loadFailedMessage
            }
            isLoading = false
        }
    }

    val timeOptions = listOf("morning", "noon", "evening", "anytime")
    val unitOptions = listOf("mg", "mcg", "g", "IU", "ml", "drops", "capsules", "tablets")
    val isValid =
        name.isNotBlank() &&
            ingredients.isNotEmpty() &&
            ingredients.all { row ->
                row.name.isNotBlank() &&
                    ((row.dosage.toLocalizedDoubleOrNull() ?: 0.0) > 0.0 || !row.originalText.isNullOrBlank())
            }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxWidth().padding(48.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier =
                    Modifier
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 32.dp)
                        .imePadding()
                        .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (isEditing) {
                        stringResource(
                            R.string.supplement_edit_edit_title,
                        )
                    } else {
                        stringResource(R.string.supplement_edit_add_title)
                    },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.food_form_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.supplement_edit_active))
                    Switch(checked = isActive, onCheckedChange = { isActive = it })
                }

                HorizontalDivider()

                // Schedule
                Text(
                    stringResource(R.string.supplement_edit_schedule),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(stringResource(R.string.supplement_edit_frequency), style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val displayOptions =
                        listOf(
                            stringResource(R.string.supplement_edit_daily) to ScheduleType.daily,
                            stringResource(R.string.supplement_edit_every_2_days) to ScheduleType.every_other_day,
                        )
                    displayOptions.forEachIndexed { index, (label, type) ->
                        SegmentedButton(
                            shape =
                                SegmentedButtonDefaults.itemShape(
                                    index,
                                    displayOptions.size,
                                ),
                            onClick = { scheduleType = type },
                            selected = scheduleType == type,
                        ) {
                            Text(label)
                        }
                    }
                }

                Text(stringResource(R.string.supplement_edit_time_of_day), style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    timeOptions.forEachIndexed { index, option ->
                        SegmentedButton(
                            shape =
                                SegmentedButtonDefaults.itemShape(
                                    index,
                                    timeOptions.size,
                                ),
                            onClick = { timeOfDay = option },
                            selected = timeOfDay == option,
                        ) {
                            Text(timeOfDayDisplayName(option))
                        }
                    }
                }

                ReminderTimesSection(
                    times = reminderTimes,
                    timeOfDay = timeOfDay,
                    onTimesChanged = { reminderTimes = it },
                )

                HorizontalDivider()

                // Ingredients — every supplement must have at least one.
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.recipe_edit_ingredients_count, ingredients.size),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    FilledTonalButton(onClick = {
                        ingredients = ingredients + SupplementIngredientRow()
                    }) {
                        Icon(Icons.Default.Add, stringResource(R.string.action_add), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.action_add))
                    }
                }

                ingredients.forEachIndexed { index, ingredient ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors =
                            CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            ),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    stringResource(R.string.supplement_edit_ingredient_number, index + 1),
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                IconButton(
                                    onClick = {
                                        if (ingredients.size <= 1) return@IconButton
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                removeAt(index)
                                            }
                                    },
                                    enabled = ingredients.size > 1,
                                    modifier = Modifier.size(32.dp),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        stringResource(R.string.recipe_edit_remove),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                            OutlinedTextField(
                                value = ingredient.name,
                                onValueChange = { newName ->
                                    ingredients =
                                        ingredients.toMutableList().apply {
                                            set(index, ingredient.copy(name = newName))
                                        }
                                },
                                label = { Text(stringResource(R.string.supplement_edit_ingredient_name)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = ingredient.dosage,
                                    onValueChange = { newDosage ->
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                set(index, ingredient.copy(dosage = newDosage))
                                            }
                                    },
                                    label = { Text(stringResource(R.string.supplement_edit_dosage)) },
                                    keyboardOptions =
                                        KeyboardOptions(
                                            keyboardType = KeyboardType.Decimal,
                                        ),
                                    modifier = Modifier.weight(1f),
                                    singleLine = true,
                                )
                                var showUnitMenu by remember { mutableStateOf(false) }
                                ExposedDropdownMenuBox(
                                    expanded = showUnitMenu,
                                    onExpandedChange = { showUnitMenu = it },
                                    modifier = Modifier.weight(0.6f),
                                ) {
                                    OutlinedTextField(
                                        value = dosageUnitDisplayName(ingredient.dosageUnit),
                                        onValueChange = {},
                                        readOnly = true,
                                        label = { Text(stringResource(R.string.food_form_unit)) },
                                        trailingIcon = {
                                            ExposedDropdownMenuDefaults.TrailingIcon(
                                                expanded = showUnitMenu,
                                            )
                                        },
                                        modifier = Modifier.menuAnchor(),
                                        singleLine = true,
                                    )
                                    ExposedDropdownMenu(
                                        expanded = showUnitMenu,
                                        onDismissRequest = { showUnitMenu = false },
                                    ) {
                                        unitOptions.forEach { unit ->
                                            DropdownMenuItem(
                                                text = { Text(dosageUnitDisplayName(unit)) },
                                                onClick = {
                                                    ingredients =
                                                        ingredients.toMutableList().apply {
                                                            set(index, ingredient.copy(dosageUnit = unit))
                                                        }
                                                    showUnitMenu = false
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

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
                            if (!isValid) return@Button
                            isSaving = true
                            scope.launch {
                                try {
                                    val ingredientInputs =
                                        ingredients.mapIndexed { idx, row ->
                                            val dose = row.dosage.toLocalizedDoubleOrNull() ?: 0.0
                                            // Prefer a rebuilt "<dosage> <unit>" label; fall back to
                                            // the preserved originalText for free-form labels.
                                            val label =
                                                when {
                                                    dose > 0.0 -> "${row.dosage.trim()} ${row.dosageUnit}"
                                                    !row.originalText.isNullOrBlank() -> row.originalText
                                                    else -> ""
                                                }
                                            SupplementIngredientInput(
                                                food =
                                                    FoodCreate(
                                                        name = row.name.trim(),
                                                        servingSize = 1.0,
                                                        servingUnit = ServingUnit.g,
                                                        calories = 0.0,
                                                        protein = 0.0,
                                                        carbs = 0.0,
                                                        fat = 0.0,
                                                        fiber = 0.0,
                                                        ingredientsText = label,
                                                    ),
                                                servings = 1.0,
                                                sortOrder = idx,
                                            )
                                        }
                                    val create =
                                        SupplementCreate(
                                            name = name.trim(),
                                            scheduleType =
                                                GenSupplementCreate.ScheduleType.entries.first {
                                                    it.value == scheduleType.value
                                                },
                                            ingredients = ingredientInputs,
                                            timeOfDay =
                                                GenSupplementCreate.TimeOfDay.entries.firstOrNull { tod ->
                                                    tod.value == timeOfDay
                                                },
                                            reminderTimes = reminderTimes.sorted(),
                                            isActive = isActive,
                                        )
                                    if (isEditing) {
                                        val id = supplementId ?: return@launch
                                        supplementRepo.updateSupplement(id, create)
                                    } else {
                                        supplementRepo.createSupplement(create)
                                    }
                                    sheetState.hide()
                                    onSaved()
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    Log.e("SupplementEditSheet", "Failed to save supplement", e)
                                    errorReporter.captureException(e)
                                    errorMessage = saveFailedMessage
                                }
                                isSaving = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && isValid,
                    ) {
                        Text(stringResource(R.string.weight_save))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

private const val MAX_REMINDER_TIMES = 6

/** The label is only a grouping header, but it's the best hint we have for what clock
 *  time the user actually means, so it seeds the first row. */
private fun defaultReminderTime(timeOfDay: String): String =
    when (timeOfDay) {
        "noon" -> "12:00"
        "evening" -> "20:00"
        else -> "08:00"
    }

/**
 * Editor for a supplement's optional reminder times. Adding the first one is the moment
 * of intent for POST_NOTIFICATIONS: asking at launch, before the user has expressed any
 * interest in notifications, is the surest way to a permanent deny.
 *
 * Reminder times save regardless of the permission — they are server-side data that the
 * other devices still act on; only this phone's delivery is gated.
 */
@Composable
private fun ReminderTimesSection(
    times: List<String>,
    timeOfDay: String,
    onTimesChanged: (List<String>) -> Unit,
) {
    val context = LocalContext.current
    var notificationsEnabled by remember {
        mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled())
    }
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            notificationsEnabled = granted
        }

    val addTime = {
        // Prefer the label's time, then the other presets, so a second row doesn't
        // silently collide with the first.
        val candidates = listOf(defaultReminderTime(timeOfDay), "08:00", "12:00", "20:00")
        val next = candidates.firstOrNull { it !in times } ?: "08:00"
        if (times.isEmpty() &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !SupplementReminderNotifier.hasPermission(context)
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        onTimesChanged((times + next).sorted())
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.supplement_reminders),
            style = MaterialTheme.typography.labelLarge,
        )
        TextButton(onClick = addTime, enabled = times.size < MAX_REMINDER_TIMES) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text(stringResource(R.string.supplement_add_reminder))
        }
    }

    if (times.isEmpty()) {
        Text(
            stringResource(R.string.supplement_reminders_none),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        times.forEachIndexed { index, time ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val parsed = SupplementSchedule.parseReminderTime(time)
                OutlinedButton(
                    onClick = {
                        TimePickerDialog(
                            context,
                            { _, hour, minute ->
                                val picked = "%02d:%02d".format(hour, minute)
                                // Distinct + sorted: the server stores them that way, and
                                // duplicates would arm two alarms on the same slot key.
                                onTimesChanged(
                                    (times.filterIndexed { i, _ -> i != index } + picked)
                                        .distinct()
                                        .sorted(),
                                )
                            },
                            parsed?.hour ?: 8,
                            parsed?.minute ?: 0,
                            true,
                        ).show()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(time)
                }
                IconButton(onClick = { onTimesChanged(times.filterIndexed { i, _ -> i != index }) }) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.supplement_remove_reminder),
                    )
                }
            }
        }

        if (!notificationsEnabled) {
            // A twice-denied permission can never be re-requested from a launcher, so the
            // only remaining route is the system settings page.
            Text(
                stringResource(R.string.settings_reminders_permission_missing),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            TextButton(onClick = { openNotificationSettings(context) }) {
                Text(stringResource(R.string.settings_reminders_permission_grant))
            }
        }
    }
}
