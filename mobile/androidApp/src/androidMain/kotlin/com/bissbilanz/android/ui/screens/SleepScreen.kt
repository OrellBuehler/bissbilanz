package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.SimpleLineChart
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SleepViewModel
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.util.formatDecimal1
import com.bissbilanz.util.formatNutrient
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.roundToInt
import kotlin.time.Clock
import kotlin.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SleepScreen(navController: NavController) {
    val viewModel: SleepViewModel = koinViewModel()
    val refreshManager: RefreshManager = koinInject()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val selectedRange by viewModel.selectedRange.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()

    var showAddSheet by remember { mutableStateOf(false) }
    var entryToEdit by remember { mutableStateOf<SleepEntry?>(null) }
    var entryToDelete by remember { mutableStateOf<SleepEntry?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()

    val ranges = listOf("7d", "30d", "90d", stringResource(R.string.weight_range_all))

    val loggedMessage = stringResource(R.string.sleep_logged)
    val logFailedMessage = stringResource(R.string.sleep_log_failed)
    val updatedMessage = stringResource(R.string.sleep_updated)
    val updateFailedMessage = stringResource(R.string.sleep_update_failed)
    val deletedMessage = stringResource(R.string.sleep_deleted)
    val deleteFailedMessage = stringResource(R.string.sleep_delete_failed)

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    if (showAddSheet) {
        SleepEditSheet(
            existing = null,
            onDismiss = { showAddSheet = false },
            onSave = { create ->
                haptic(HapticFeedbackType.LongPress)
                viewModel.createEntry(create, loggedMessage, logFailedMessage)
                showAddSheet = false
            },
        )
    }

    entryToEdit?.let { entry ->
        SleepEditSheet(
            existing = entry,
            onDismiss = { entryToEdit = null },
            onSave = { create ->
                viewModel.updateEntry(
                    entry.id,
                    SleepUpdate(
                        durationMinutes = create.durationMinutes,
                        quality = create.quality,
                        entryDate = create.entryDate,
                        bedtime = create.bedtime,
                        wakeTime = create.wakeTime,
                        wakeUps = create.wakeUps,
                        notes = create.notes,
                    ),
                    updatedMessage,
                    updateFailedMessage,
                )
                entryToEdit = null
            },
        )
    }

    entryToDelete?.let { entry ->
        AlertDialog(
            onDismissRequest = { entryToDelete = null },
            title = { Text(stringResource(R.string.sleep_delete_dialog_title)) },
            text = { Text(stringResource(R.string.sleep_delete_dialog_text, entry.entryDate)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteEntry(entry.id, deletedMessage, deleteFailedMessage)
                        entryToDelete = null
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { entryToDelete = null }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.sleep_section_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    haptic(HapticFeedbackType.LongPress)
                    showAddSheet = true
                },
            ) {
                Icon(Icons.Default.Add, stringResource(R.string.sleep_log_content_desc))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                viewModel.refresh()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading && entries.isEmpty(), label = "sleep") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (entries.isEmpty()) {
                    EmptyState(stringResource(R.string.sleep_no_entries))
                } else {
                    val chartEntries = remember(entries, selectedRange) { viewModel.chartEntries(entries) }
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 80.dp, top = 8.dp),
                    ) {
                        item { SleepSummaryRow(entries) }

                        item {
                            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                ranges.forEachIndexed { index, label ->
                                    SegmentedButton(
                                        selected = selectedRange == index,
                                        onClick = { viewModel.selectRange(index) },
                                        shape = SegmentedButtonDefaults.itemShape(index, ranges.size),
                                    ) {
                                        Text(label)
                                    }
                                }
                            }
                        }

                        if (chartEntries.size >= 3) {
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Text(
                                            stringResource(R.string.sleep_duration_trend),
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        SimpleLineChart(
                                            data = chartEntries.map { it.durationMinutes.toFloat() / 60f },
                                            color = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.fillMaxWidth().height(120.dp),
                                            unit = "h",
                                        )
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Text(
                                            stringResource(R.string.sleep_quality_trend),
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        SimpleLineChart(
                                            data = chartEntries.map { it.quality.toFloat() },
                                            color = MaterialTheme.colorScheme.tertiary,
                                            modifier = Modifier.fillMaxWidth().height(120.dp),
                                            unit = "",
                                        )
                                    }
                                }
                            }
                        }

                        items(entries, key = { it.id }) { entry ->
                            Card(modifier = Modifier.fillMaxWidth().animateItem()) {
                                ListItem(
                                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                    leadingContent = {
                                        Icon(
                                            Icons.Default.Bedtime,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.tertiary,
                                        )
                                    },
                                    headlineContent = {
                                        Text(
                                            stringResource(
                                                R.string.sleep_entry_headline,
                                                (entry.durationMinutes / 60.0).formatDecimal1(),
                                                entry.quality.formatNutrient(),
                                            ),
                                            fontWeight = FontWeight.Bold,
                                        )
                                    },
                                    supportingContent = {
                                        Column {
                                            Text(entry.entryDate)
                                            val bed = entry.bedtime?.let { formatTimeOfDay(it) }
                                            val wake = entry.wakeTime?.let { formatTimeOfDay(it) }
                                            if (bed != null && wake != null) {
                                                Text(
                                                    stringResource(R.string.sleep_bed_wake_summary, bed, wake),
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                            entry.wakeUps?.takeIf { it > 0 }?.let {
                                                Text(
                                                    stringResource(R.string.sleep_wake_ups_summary, it),
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                            entry.notes?.takeIf { it.isNotBlank() }?.let {
                                                Text(
                                                    it,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                    },
                                    trailingContent = {
                                        Row {
                                            IconButton(onClick = { entryToEdit = entry }) {
                                                Icon(Icons.Default.Edit, stringResource(R.string.sleep_edit_content_desc))
                                            }
                                            IconButton(onClick = { entryToDelete = entry }) {
                                                Icon(
                                                    Icons.Default.Delete,
                                                    stringResource(R.string.sleep_delete_content_desc),
                                                    tint = MaterialTheme.colorScheme.error,
                                                )
                                            }
                                        }
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
private fun SleepSummaryRow(entries: List<SleepEntry>) {
    // "Last night" is the newest entry; the average covers the 7 most recent,
    // mirroring the iOS summary cards.
    val latest = entries.firstOrNull()
    val recent = entries.take(7)
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Card(modifier = Modifier.weight(1f)) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    stringResource(R.string.sleep_last_night),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    latest?.let { "${(it.durationMinutes / 60.0).formatDecimal1()}h" } ?: "—",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                latest?.let {
                    Text(
                        stringResource(R.string.sleep_quality_value, it.quality.formatNutrient()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Card(modifier = Modifier.weight(1f)) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    stringResource(R.string.sleep_seven_day_average),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    if (recent.isEmpty()) {
                        "—"
                    } else {
                        "${(recent.map { it.durationMinutes }.average() / 60.0).formatDecimal1()}h"
                    },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.tertiary,
                )
                if (recent.isNotEmpty()) {
                    Text(
                        stringResource(
                            R.string.sleep_quality_value,
                            recent.map { it.quality }.average().formatDecimal1(),
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Renders an ISO instant as a local HH:MM label; falls back to the raw string. */
private fun formatTimeOfDay(iso: String): String =
    runCatching {
        val local = Instant.parse(iso).toLocalDateTime(TimeZone.currentSystemDefault())
        "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
    }.getOrDefault(iso)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SleepEditSheet(
    existing: SleepEntry?,
    onDismiss: () -> Unit,
    onSave: (SleepCreate) -> Unit,
) {
    val zone = TimeZone.currentSystemDefault()
    val today = Clock.System.todayIn(zone)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var date by remember { mutableStateOf(existing?.entryDate ?: today.toString()) }
    var hours by remember { mutableStateOf(((existing?.durationMinutes ?: 480) / 60).toString()) }
    var minutes by remember { mutableStateOf(((existing?.durationMinutes ?: 480) % 60).toString()) }
    var quality by remember { mutableFloatStateOf((existing?.quality ?: 7.0).toFloat()) }
    var notes by remember { mutableStateOf(existing?.notes ?: "") }
    var wakeUpsText by remember { mutableStateOf(existing?.wakeUps?.toString() ?: "") }

    val existingBed = remember(existing) { existing?.bedtime?.let { localTimeOrNull(it, zone) } }
    val existingWake = remember(existing) { existing?.wakeTime?.let { localTimeOrNull(it, zone) } }
    var timesEnabled by remember { mutableStateOf(existingBed != null && existingWake != null) }
    var bedtime by remember { mutableStateOf(existingBed ?: LocalTime(23, 0)) }
    var wakeTime by remember { mutableStateOf(existingWake ?: LocalTime(7, 0)) }

    var showDatePicker by remember { mutableStateOf(false) }
    var showBedtimePicker by remember { mutableStateOf(false) }
    var showWakePicker by remember { mutableStateOf(false) }

    val totalMinutes = (hours.toIntOrNull() ?: 0) * 60 + (minutes.toIntOrNull() ?: 0)
    val durationError = totalMinutes <= 0

    if (showDatePicker) {
        val initial = runCatching { LocalDate.parse(date) }.getOrDefault(today)
        val state = rememberDatePickerState(initialSelectedDateMillis = initial.toEpochDays().toLong() * 86_400_000L)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { millis ->
                        date =
                            Instant
                                .fromEpochMilliseconds(millis)
                                .toLocalDateTime(TimeZone.UTC)
                                .date
                                .toString()
                    }
                    showDatePicker = false
                }) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = state) }
    }

    if (showBedtimePicker) {
        SleepTimePickerDialog(
            initial = bedtime,
            title = stringResource(R.string.sleep_bedtime_label),
            onDismiss = { showBedtimePicker = false },
            onConfirm = {
                bedtime = it
                showBedtimePicker = false
            },
        )
    }

    if (showWakePicker) {
        SleepTimePickerDialog(
            initial = wakeTime,
            title = stringResource(R.string.sleep_wake_time_label),
            onDismiss = { showWakePicker = false },
            onConfirm = {
                wakeTime = it
                showWakePicker = false
            },
        )
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(
                    if (existing == null) R.string.sleep_log_dialog_title else R.string.sleep_edit_title,
                ),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            OutlinedTextField(
                value = date,
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(R.string.insights_sleep_date_label)) },
                trailingIcon = {
                    IconButton(onClick = { showDatePicker = true }) {
                        Icon(Icons.Default.CalendarToday, stringResource(R.string.insights_sleep_pick_date))
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Text(stringResource(R.string.insights_sleep_duration_label), style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = hours,
                    onValueChange = { hours = it.filter { c -> c.isDigit() } },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    suffix = { Text(stringResource(R.string.insights_hours_unit)) },
                    isError = durationError,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = minutes,
                    onValueChange = { minutes = it.filter { c -> c.isDigit() } },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    suffix = { Text(stringResource(R.string.insights_minutes_unit)) },
                    isError = durationError,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }
            if (durationError) {
                Text(
                    stringResource(R.string.insights_sleep_duration_error),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Text(
                stringResource(R.string.insights_sleep_quality_label, quality.roundToInt().toString()),
                style = MaterialTheme.typography.labelMedium,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.sleep_quality_poor), style = MaterialTheme.typography.labelSmall)
                Slider(
                    value = quality,
                    onValueChange = { quality = it },
                    valueRange = 1f..10f,
                    steps = 8,
                    modifier = Modifier.weight(1f),
                )
                Text(stringResource(R.string.sleep_quality_great), style = MaterialTheme.typography.labelSmall)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.sleep_bed_and_wake_times), style = MaterialTheme.typography.bodyMedium)
                Switch(checked = timesEnabled, onCheckedChange = { timesEnabled = it })
            }

            if (timesEnabled) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { showBedtimePicker = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.Schedule, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.sleep_bedtime_value, formatLocalTime(bedtime)))
                    }
                    OutlinedButton(
                        onClick = { showWakePicker = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.Schedule, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.sleep_wake_time_value, formatLocalTime(wakeTime)))
                    }
                }
            }

            OutlinedTextField(
                value = wakeUpsText,
                onValueChange = { wakeUpsText = it.filter { c -> c.isDigit() } },
                label = { Text(stringResource(R.string.sleep_wake_ups_label)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text(stringResource(R.string.weight_notes_label)) },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.dialog_cancel))
                }
                Button(
                    onClick = {
                        val entryDate = runCatching { LocalDate.parse(date) }.getOrDefault(today)
                        onSave(
                            SleepCreate(
                                durationMinutes = totalMinutes,
                                quality = quality.roundToInt().toDouble(),
                                entryDate = date,
                                // Bedtime belongs to the evening before the entry date;
                                // wake time to the entry date itself.
                                bedtime =
                                    if (timesEnabled) {
                                        LocalDateTime(entryDate.minus(1, DateTimeUnit.DAY), bedtime)
                                            .toInstant(zone)
                                            .toString()
                                    } else {
                                        null
                                    },
                                wakeTime =
                                    if (timesEnabled) {
                                        LocalDateTime(entryDate, wakeTime).toInstant(zone).toString()
                                    } else {
                                        null
                                    },
                                wakeUps = wakeUpsText.toIntOrNull(),
                                notes = notes.trim().ifBlank { null },
                            ),
                        )
                    },
                    enabled = !durationError,
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.weight_save)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SleepTimePickerDialog(
    initial: LocalTime,
    title: String,
    onDismiss: () -> Unit,
    onConfirm: (LocalTime) -> Unit,
) {
    val state = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { TimePicker(state = state) },
        confirmButton = {
            TextButton(onClick = { onConfirm(LocalTime(state.hour, state.minute)) }) {
                Text(stringResource(R.string.dialog_ok))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

private fun formatLocalTime(time: LocalTime): String = "${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}"

private fun localTimeOrNull(
    iso: String,
    zone: TimeZone,
): LocalTime? = runCatching { Instant.parse(iso).toLocalDateTime(zone).time }.getOrNull()
