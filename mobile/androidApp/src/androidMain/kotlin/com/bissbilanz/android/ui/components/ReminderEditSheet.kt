package com.bissbilanz.android.ui.components

import android.Manifest
import android.app.TimePickerDialog
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.health.HealthSyncPreferences
import com.bissbilanz.android.reminders.ReminderNotifier
import com.bissbilanz.android.ui.openNotificationSettings
import com.bissbilanz.api.generated.model.Reminder
import com.bissbilanz.api.generated.model.ReminderCreate
import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.repository.ReminderRepository
import com.bissbilanz.util.SupplementSchedule
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private val ALL_WEEKDAYS = (0..6).toList()

/**
 * Add/edit sheet for a general logging reminder (weight / meal / sleep). Mirrors
 * [SupplementEditSheet]'s shape — injects [ReminderRepository] directly rather than
 * going through a ViewModel, its own delete confirmation, and the same
 * request-notification-permission-on-first-use pattern.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReminderEditSheet(
    reminderId: String?,
    mealTypeOptions: List<String>,
    hasExistingReminders: Boolean,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val reminderRepo: ReminderRepository = koinInject()
    val healthPrefs: HealthSyncPreferences = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isLoading by remember { mutableStateOf(reminderId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    val isEditing = reminderId != null

    var kind by remember { mutableStateOf(Reminder.Kind.weight) }
    var mealType by remember { mutableStateOf(mealTypeOptions.firstOrNull() ?: "Breakfast") }
    var time by remember { mutableStateOf("08:00") }
    var weekdays by remember { mutableStateOf(ALL_WEEKDAYS) }
    var enabled by remember { mutableStateOf(true) }
    var mealTypeMenuExpanded by remember { mutableStateOf(false) }

    var notificationsEnabled by remember {
        mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled())
    }
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            notificationsEnabled = granted
        }

    val loadFailedMessage = stringResource(R.string.reminders_load_failed)
    val saveFailedMessage = stringResource(R.string.reminders_save_failed)
    val deleteFailedMessage = stringResource(R.string.reminders_delete_failed)

    LaunchedEffect(reminderId) {
        if (reminderId != null) {
            try {
                val found = reminderRepo.reminders().first().find { it.id == reminderId }
                if (found != null) {
                    kind = found.kind
                    mealType = found.mealType ?: mealTypeOptions.firstOrNull() ?: "Breakfast"
                    time = found.time
                    weekdays = found.weekdays
                    enabled = found.enabled
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                errorMessage = loadFailedMessage
            }
            isLoading = false
        }
    }

    val isValid = weekdays.isNotEmpty() && (kind != Reminder.Kind.meal || mealType.isNotBlank())

    if (showDeleteDialog && reminderId != null) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.reminders_delete_title)) },
            text = { Text(stringResource(R.string.reminders_delete_text)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                reminderRepo.deleteReminder(reminderId)
                                showDeleteDialog = false
                                sheetState.hide()
                                onSaved()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        if (isEditing) stringResource(R.string.reminders_edit) else stringResource(R.string.reminders_add),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    if (isEditing) {
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(
                                Icons.Default.Delete,
                                stringResource(R.string.action_delete),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                Text(stringResource(R.string.reminders_kind), style = MaterialTheme.typography.labelLarge)
                val kindOptions =
                    listOf(
                        Triple(Reminder.Kind.weight, R.string.reminders_kind_weight, Icons.Default.MonitorWeight),
                        Triple(Reminder.Kind.meal, R.string.reminders_kind_meal, Icons.Default.Restaurant),
                        Triple(Reminder.Kind.sleep, R.string.reminders_kind_sleep, Icons.Default.Bedtime),
                    )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    kindOptions.forEachIndexed { index, (option, labelRes, icon) ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index, kindOptions.size),
                            onClick = { kind = option },
                            selected = kind == option,
                        ) {
                            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(stringResource(labelRes), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                if (kind == Reminder.Kind.weight && healthPrefs.readWeight) {
                    Text(
                        stringResource(R.string.reminders_health_hint_weight),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (kind == Reminder.Kind.sleep && healthPrefs.readSleep) {
                    Text(
                        stringResource(R.string.reminders_health_hint_sleep),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (kind == Reminder.Kind.meal) {
                    Text(stringResource(R.string.reminders_meal_type), style = MaterialTheme.typography.labelLarge)
                    ExposedDropdownMenuBox(
                        expanded = mealTypeMenuExpanded,
                        onExpandedChange = { mealTypeMenuExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = mealType,
                            onValueChange = {},
                            readOnly = true,
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = mealTypeMenuExpanded)
                            },
                            modifier =
                                Modifier
                                    .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth(),
                        )
                        ExposedDropdownMenu(
                            expanded = mealTypeMenuExpanded,
                            onDismissRequest = { mealTypeMenuExpanded = false },
                        ) {
                            mealTypeOptions.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option) },
                                    onClick = {
                                        mealType = option
                                        mealTypeMenuExpanded = false
                                    },
                                )
                            }
                        }
                    }
                }

                Text(stringResource(R.string.reminders_time), style = MaterialTheme.typography.labelLarge)
                val parsedTime = SupplementSchedule.parseReminderTime(time)
                OutlinedButton(
                    onClick = {
                        TimePickerDialog(
                            context,
                            { _, hour, minute -> time = "%02d:%02d".format(hour, minute) },
                            parsedTime?.hour ?: 8,
                            parsedTime?.minute ?: 0,
                            true,
                        ).show()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(time) }

                Text(stringResource(R.string.reminders_weekdays), style = MaterialTheme.typography.labelLarge)
                val dayLabels = weekdayLabels()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    dayLabels.forEachIndexed { day, label ->
                        FilterChip(
                            selected = day in weekdays,
                            onClick = {
                                weekdays = if (day in weekdays) weekdays - day else (weekdays + day).sorted()
                            },
                            label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (weekdays.isEmpty()) {
                    Text(
                        stringResource(R.string.reminders_days_required),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.reminders_enabled))
                    Switch(checked = enabled, onCheckedChange = { enabled = it })
                }

                if (!notificationsEnabled) {
                    Text(
                        stringResource(R.string.settings_reminders_permission_missing),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    TextButton(onClick = { openNotificationSettings(context) }) {
                        Text(stringResource(R.string.settings_reminders_permission_grant))
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
                                    if (isEditing) {
                                        val id = reminderId ?: return@launch
                                        reminderRepo.updateReminder(
                                            id,
                                            ReminderUpdate(
                                                kind = ReminderUpdate.Kind.valueOf(kind.name),
                                                mealType = if (kind == Reminder.Kind.meal) mealType else null,
                                                time = time,
                                                weekdays = weekdays.sorted(),
                                                enabled = enabled,
                                            ),
                                        )
                                    } else {
                                        // Adding the first reminder is the moment of intent for
                                        // POST_NOTIFICATIONS — asking at launch, before any
                                        // expressed interest, is the surest way to a permanent
                                        // deny. Reminder times save regardless of the
                                        // permission; only this phone's delivery is gated.
                                        if (!hasExistingReminders &&
                                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                            !ReminderNotifier.hasPermission(context)
                                        ) {
                                            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                        }
                                        reminderRepo.createReminder(
                                            ReminderCreate(
                                                kind = ReminderCreate.Kind.valueOf(kind.name),
                                                time = time,
                                                mealType = if (kind == Reminder.Kind.meal) mealType else null,
                                                weekdays = weekdays.sorted(),
                                                enabled = enabled,
                                            ),
                                        )
                                    }
                                    sheetState.hide()
                                    onSaved()
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    errorReporter.captureException(e)
                                    errorMessage = saveFailedMessage
                                }
                                isSaving = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && isValid,
                    ) {
                        Text(stringResource(R.string.reminders_save))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
