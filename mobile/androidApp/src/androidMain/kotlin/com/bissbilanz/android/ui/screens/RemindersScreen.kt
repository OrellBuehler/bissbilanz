package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.NAV_KEY_EDIT_SUPPLEMENT_ID
import com.bissbilanz.android.reminders.SupplementReminderPreferences
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.ReminderEditSheet
import com.bissbilanz.android.ui.components.weekdayLabels
import com.bissbilanz.android.ui.openNotificationSettings
import com.bissbilanz.android.ui.viewmodels.RemindersViewModel
import com.bissbilanz.api.generated.model.Reminder
import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.model.Supplement
import com.bissbilanz.util.mealTypes
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RemindersScreen(navController: NavController) {
    val viewModel: RemindersViewModel = koinViewModel()
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    val supplementReminders by viewModel.supplementReminders.collectAsStateWithLifecycle()
    val customMealTypes by viewModel.customMealTypes.collectAsStateWithLifecycle()
    val snackbarMessageRes by viewModel.snackbarMessageRes.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    val reminderPrefs: SupplementReminderPreferences = koinInject()
    var snoozeMinutes by remember { mutableIntStateOf(reminderPrefs.snoozeMinutes) }
    var snoozeMenuExpanded by remember { mutableStateOf(false) }
    val notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()

    var showForm by remember { mutableStateOf(false) }
    var editingReminderId by remember { mutableStateOf<String?>(null) }

    val mealTypeOptions = remember(customMealTypes) { mealTypes + customMealTypes.map { it.name } }

    LaunchedEffect(Unit) { viewModel.refresh() }

    LaunchedEffect(snackbarMessageRes) {
        snackbarMessageRes?.let { res ->
            snackbarHostState.showSnackbar(context.getString(res))
            viewModel.clearSnackbar()
        }
    }

    @Composable
    fun snoozeLabel(minutes: Int) =
        if (minutes % 60 == 0 && minutes >= 60) {
            stringResource(R.string.settings_snooze_hours, minutes / 60)
        } else {
            stringResource(R.string.settings_snooze_minutes, minutes)
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.reminders_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                editingReminderId = null
                showForm = true
            }) {
                Icon(Icons.Default.Add, stringResource(R.string.reminders_add))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (showForm) {
            ReminderEditSheet(
                reminderId = editingReminderId,
                mealTypeOptions = mealTypeOptions,
                hasExistingReminders = reminders.isNotEmpty(),
                onDismiss = {
                    showForm = false
                    editingReminderId = null
                },
                onSaved = {
                    showForm = false
                    editingReminderId = null
                    viewModel.refresh()
                },
            )
        }

        PullToRefreshWrapper(
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Snooze duration + notification-permission nudge, moved here from Settings
                // since they now apply to every reminder kind, not just supplements.
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.settings_reminders_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = snoozeMenuExpanded,
                            onExpandedChange = { snoozeMenuExpanded = it },
                        ) {
                            OutlinedTextField(
                                value = snoozeLabel(snoozeMinutes),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(stringResource(R.string.settings_snooze_duration)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = snoozeMenuExpanded)
                                },
                                modifier =
                                    Modifier
                                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                                        .fillMaxWidth(),
                            )
                            ExposedDropdownMenu(
                                expanded = snoozeMenuExpanded,
                                onDismissRequest = { snoozeMenuExpanded = false },
                            ) {
                                SupplementReminderPreferences.SNOOZE_PRESETS.forEach { minutes ->
                                    DropdownMenuItem(
                                        text = { Text(snoozeLabel(minutes)) },
                                        onClick = {
                                            snoozeMinutes = minutes
                                            reminderPrefs.snoozeMinutes = minutes
                                            snoozeMenuExpanded = false
                                        },
                                    )
                                }
                            }
                        }

                        if (!notificationsEnabled) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.settings_reminders_permission_missing),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                            TextButton(onClick = { openNotificationSettings(context) }) {
                                Text(stringResource(R.string.settings_reminders_permission_grant))
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.settings_reminders_delay_note),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                if (reminders.isEmpty()) {
                    Text(
                        stringResource(R.string.reminders_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        reminders.forEach { reminder ->
                            ReminderRow(
                                reminder = reminder,
                                onClick = {
                                    editingReminderId = reminder.id
                                    showForm = true
                                },
                                onToggle = {
                                    viewModel.updateReminder(reminder.id, ReminderUpdate(enabled = !reminder.enabled))
                                },
                            )
                        }
                    }
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.reminders_supplements_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            stringResource(R.string.reminders_supplements_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        if (supplementReminders.isEmpty()) {
                            Text(
                                stringResource(R.string.reminders_supplements_empty),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            supplementReminders.forEach { supplement ->
                                SupplementReminderRow(
                                    supplement = supplement,
                                    onClick = {
                                        navController.navigate("supplements")
                                        navController.currentBackStackEntry
                                            ?.savedStateHandle
                                            ?.set(NAV_KEY_EDIT_SUPPLEMENT_ID, supplement.id)
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReminderRow(
    reminder: Reminder,
    onClick: () -> Unit,
    onToggle: () -> Unit,
) {
    val icon = reminderKindIcon(reminder.kind)
    val dayLabels = weekdayLabels()
    Card(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.width(16.dp))
            Text(reminderSummary(reminder, dayLabels), modifier = Modifier.weight(1f))
            Switch(checked = reminder.enabled, onCheckedChange = { onToggle() })
        }
    }
}

@Composable
private fun SupplementReminderRow(
    supplement: Supplement,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(MaterialTheme.shapes.small)
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(supplement.name, style = MaterialTheme.typography.bodyMedium)
        Text(
            supplement.reminderTimes.orEmpty().joinToString(", "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun reminderKindIcon(kind: Reminder.Kind): ImageVector =
    when (kind) {
        Reminder.Kind.weight -> Icons.Default.MonitorWeight
        Reminder.Kind.meal -> Icons.Default.Restaurant
        Reminder.Kind.sleep -> Icons.Default.Bedtime
    }

/** e.g. "Lunch · 12:30 · Mon, Tue, Wed, Thu, Fri" or "08:00 · Every day". */
@Composable
private fun reminderSummary(
    reminder: Reminder,
    dayLabels: List<String>,
): String {
    val parts = mutableListOf<String>()
    if (reminder.kind == Reminder.Kind.meal) {
        reminder.mealType?.let { parts.add(it) }
    }
    parts.add(reminder.time)
    parts.add(
        if (reminder.weekdays.size == 7) {
            stringResource(R.string.reminders_every_day)
        } else {
            reminder.weekdays.sorted().joinToString(", ") { dayLabels[it] }
        },
    )
    return parts.joinToString(" · ")
}
