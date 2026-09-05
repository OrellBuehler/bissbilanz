package com.bissbilanz.android.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.android.fasting.FastingSession
import com.bissbilanz.android.ui.theme.FastingIndigo
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.ui.theme.rememberHaptic
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import org.koin.compose.koinInject
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

/** The preset protocols offered on the start screen, mirroring iOS. */
private enum class FastingProtocol(
    val label: String,
    val hours: Int?,
) {
    SIXTEEN_EIGHT("16:8", 16),
    EIGHTEEN_SIX("18:6", 18),
    TWENTY_FOUR("20:4", 20),
    CUSTOM("", null),
}

private val TARGET_OPTIONS = listOf(14, 16, 18, 20, 24, 36)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FastingScreen(navController: NavController) {
    val fastingManager: FastingManager = koinInject()
    val session by fastingManager.session.collectAsStateWithLifecycle()
    val history by fastingManager.history.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val haptic = rememberHaptic()
    val context = LocalContext.current

    var selectedProtocol by remember { mutableStateOf(FastingProtocol.SIXTEEN_EIGHT) }
    var customHours by remember { mutableIntStateOf(16) }
    var showEndConfirmation by remember { mutableStateOf(false) }
    var showTargetMenu by remember { mutableStateOf(false) }
    // Null means "now" — the start-section chip shows the live clock until the
    // user picks a time, so a fast started on time carries no stale instant.
    var startOverride by remember { mutableStateOf<Instant?>(null) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showActiveStartPicker by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<FastingSession?>(null) }

    // The notification's End Fast action can clear the session from outside the
    // UI, so reconcile whenever this screen comes back into view.
    LaunchedEffect(Unit) { fastingManager.refresh() }

    // The ongoing notification is the only way to end a fast without opening the
    // app, and POST_NOTIFICATIONS is runtime-granted from API 33 — without asking,
    // FastingNotifier would silently post nothing. Re-posting on grant covers the
    // session started before the dialog was answered.
    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted -> if (granted) fastingManager.refresh() }

    if (showEndConfirmation) {
        AlertDialog(
            onDismissRequest = { showEndConfirmation = false },
            title = { Text(stringResource(R.string.fasting_end_confirmation)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showEndConfirmation = false
                        haptic(HapticFeedbackType.LongPress)
                        scope.launch { fastingManager.stop() }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.fasting_end)) }
            },
            dismissButton = {
                TextButton(onClick = { showEndConfirmation = false }) {
                    Text(stringResource(R.string.dialog_cancel))
                }
            },
        )
    }

    if (showStartPicker) {
        FastingInstantDialog(
            title = stringResource(R.string.fasting_started_at),
            initial = startOverride ?: Clock.System.now(),
            onDismiss = { showStartPicker = false },
            onConfirm = {
                startOverride = it
                showStartPicker = false
            },
        )
    }

    session?.let { active ->
        if (showActiveStartPicker) {
            FastingInstantDialog(
                title = stringResource(R.string.fasting_adjust_start),
                initial = active.startedAt,
                onDismiss = { showActiveStartPicker = false },
                onConfirm = {
                    fastingManager.changeStart(it)
                    showActiveStartPicker = false
                },
            )
        }
    }

    editing?.let { target ->
        FastingHistoryEditDialog(
            session = target,
            onDismiss = { editing = null },
            onSave = { updated ->
                editing = null
                scope.launch { fastingManager.updateHistory(updated) }
            },
            onDelete = {
                editing = null
                scope.launch { fastingManager.deleteHistory(target.id) }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.fasting_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val current = session
            if (current != null) {
                ActiveFastSection(
                    session = current,
                    showTargetMenu = showTargetMenu,
                    onShowTargetMenu = { showTargetMenu = it },
                    onChangeTarget = { fastingManager.changeTarget(it) },
                    onAdjustStart = { showActiveStartPicker = true },
                    onEnd = { showEndConfirmation = true },
                )
            } else {
                StartSection(
                    selectedProtocol = selectedProtocol,
                    onSelectProtocol = { selectedProtocol = it },
                    customHours = customHours,
                    onCustomHoursChange = { customHours = it },
                    startOverride = startOverride,
                    onPickStart = { showStartPicker = true },
                    onResetStart = { startOverride = null },
                    onStart = {
                        haptic(HapticFeedbackType.LongPress)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                            PackageManager.PERMISSION_GRANTED
                        ) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        fastingManager.start(selectedProtocol.hours ?: customHours, startOverride ?: Clock.System.now())
                        startOverride = null
                    },
                )
            }

            HistorySection(history, onEdit = { editing = it })
        }
    }
}

@Composable
private fun ActiveFastSection(
    session: FastingSession,
    showTargetMenu: Boolean,
    onShowTargetMenu: (Boolean) -> Unit,
    onChangeTarget: (Int) -> Unit,
    onAdjustStart: () -> Unit,
    onEnd: () -> Unit,
) {
    // One-second tick drives both the ring and the elapsed readout.
    var now by remember { mutableStateOf(Clock.System.now()) }
    LaunchedEffect(session.id, session.startedAtEpochMs) {
        while (true) {
            now = Clock.System.now()
            delay(1000)
        }
    }

    val progress = session.progress(now)
    val elapsed = session.elapsed(now)

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(250.dp)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val stroke = 14.dp.toPx()
                val inset = stroke / 2
                val arcSize = Size(size.width - stroke, size.height - stroke)
                drawArc(
                    color = FastingIndigo.copy(alpha = 0.15f),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft =
                        androidx.compose.ui.geometry
                            .Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = stroke),
                )
                drawArc(
                    color = FastingIndigo,
                    startAngle = -90f,
                    sweepAngle = 360f * progress,
                    useCenter = false,
                    topLeft =
                        androidx.compose.ui.geometry
                            .Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    formatElapsed(elapsed),
                    fontSize = 38.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    stringResource(R.string.fasting_of_target_hours, session.targetHours),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (progress >= 1f) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = TrendGreen.macroTextTone(),
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            stringResource(R.string.fasting_target_reached),
                            style = MaterialTheme.typography.labelSmall,
                            color = TrendGreen.macroTextTone(),
                        )
                    }
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier =
                        Modifier
                            .weight(1f)
                            .clickable(onClick = onAdjustStart)
                            .padding(vertical = 4.dp),
                ) {
                    Text(
                        stringResource(R.string.fasting_started),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(formatStartLabel(session.startedAt, now), style = MaterialTheme.typography.titleSmall)
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = stringResource(R.string.fasting_adjust_start),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                Box {
                    TextButton(onClick = { onShowTargetMenu(true) }) {
                        Icon(Icons.Default.Tune, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            stringResource(R.string.fasting_change_target),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    DropdownMenu(expanded = showTargetMenu, onDismissRequest = { onShowTargetMenu(false) }) {
                        TARGET_OPTIONS.forEach { hours ->
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.fasting_target_hours, hours)) },
                                onClick = {
                                    onShowTargetMenu(false)
                                    onChangeTarget(hours)
                                },
                            )
                        }
                    }
                }
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.fasting_ends),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(formatTime(session.targetEnd), style = MaterialTheme.typography.titleSmall)
                }
            }
        }

        Button(
            onClick = onEnd,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = FastingIndigo),
        ) {
            Text(stringResource(R.string.fasting_end), style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
private fun StartSection(
    selectedProtocol: FastingProtocol,
    onSelectProtocol: (FastingProtocol) -> Unit,
    customHours: Int,
    onCustomHoursChange: (Int) -> Unit,
    startOverride: Instant?,
    onPickStart: () -> Unit,
    onResetStart: () -> Unit,
    onStart: () -> Unit,
) {
    val customLabel = stringResource(R.string.fasting_protocol_custom)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Default.Timer,
                contentDescription = null,
                tint = FastingIndigo.macroTextTone(),
                modifier = Modifier.size(40.dp),
            )
            Text(
                stringResource(R.string.fasting_not_running),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                FastingProtocol.entries.forEachIndexed { index, option ->
                    SegmentedButton(
                        selected = selectedProtocol == option,
                        onClick = { onSelectProtocol(option) },
                        shape = SegmentedButtonDefaults.itemShape(index, FastingProtocol.entries.size),
                    ) {
                        Text(option.hours?.let { option.label } ?: customLabel, maxLines = 1)
                    }
                }
            }

            if (selectedProtocol == FastingProtocol.CUSTOM) {
                Text(
                    stringResource(R.string.fasting_custom_description, customHours),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Slider(
                    value = customHours.toFloat(),
                    onValueChange = { onCustomHoursChange(it.toInt()) },
                    valueRange = 1f..48f,
                    steps = 46,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                selectedProtocol.hours?.let { hours ->
                    Text(
                        stringResource(R.string.fasting_protocol_description, hours, 24 - hours),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Forgot to start the timer before bed? Back-date the start here; the
            // ring, the notification and the history all count from that instant.
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.fasting_started_at),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (startOverride != null) {
                    TextButton(onClick = onResetStart) {
                        Text(stringResource(R.string.fasting_start_now), style = MaterialTheme.typography.labelSmall)
                    }
                }
                AssistChip(
                    onClick = onPickStart,
                    label = {
                        Text(
                            startOverride?.let { formatDateTime(it) } ?: stringResource(R.string.fasting_start_now),
                        )
                    },
                    leadingIcon = { Icon(Icons.Default.Edit, null, modifier = Modifier.size(16.dp)) },
                )
            }

            Button(
                onClick = onStart,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = FastingIndigo),
            ) {
                Text(stringResource(R.string.fasting_start), style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

@Composable
private fun HistorySection(
    history: List<FastingSession>,
    onEdit: (FastingSession) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Text(
                stringResource(R.string.fasting_history),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
            )
            Spacer(modifier = Modifier.height(8.dp))
            if (history.isEmpty()) {
                Text(
                    stringResource(R.string.fasting_no_history),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                history.take(15).forEach { session ->
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 44.dp)
                                .clickable { onEdit(session) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(formatDate(session.startedAt), style = MaterialTheme.typography.bodyMedium)
                            Text(
                                session.endedAt?.let { "${formatTime(session.startedAt)} – ${formatTime(it)} · " }.orEmpty() +
                                    stringResource(R.string.fasting_target_hours, session.targetHours),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            formatElapsed(session.duration ?: Duration.ZERO),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (session.reachedTarget) {
                            Spacer(modifier = Modifier.width(6.dp))
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = stringResource(R.string.fasting_target_reached),
                                tint = TrendGreen.macroTextTone(),
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                    HorizontalDivider()
                }
                Text(
                    stringResource(R.string.fasting_history_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

/**
 * Edits a finished fast: start, end and target. The dialog validates the range
 * itself so the manager only ever stores an end after its start.
 */
@Composable
private fun FastingHistoryEditDialog(
    session: FastingSession,
    onDismiss: () -> Unit,
    onSave: (FastingSession) -> Unit,
    onDelete: () -> Unit,
) {
    var startedAt by remember(session.id) { mutableStateOf(session.startedAt) }
    var endedAt by remember(session.id) { mutableStateOf(session.endedAt ?: Clock.System.now()) }
    var targetHours by remember(session.id) { mutableIntStateOf(session.targetHours) }
    var pickingStart by remember { mutableStateOf(false) }
    var pickingEnd by remember { mutableStateOf(false) }
    var showTargetMenu by remember { mutableStateOf(false) }
    val valid = endedAt > startedAt

    if (pickingStart) {
        FastingInstantDialog(
            title = stringResource(R.string.fasting_started),
            initial = startedAt,
            onDismiss = { pickingStart = false },
            onConfirm = {
                startedAt = it
                pickingStart = false
            },
        )
    }
    if (pickingEnd) {
        FastingInstantDialog(
            title = stringResource(R.string.fasting_ended),
            initial = endedAt,
            onDismiss = { pickingEnd = false },
            onConfirm = {
                endedAt = it
                pickingEnd = false
            },
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.fasting_edit_fast)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                EditRow(stringResource(R.string.fasting_started), formatDateTime(startedAt)) { pickingStart = true }
                EditRow(stringResource(R.string.fasting_ended), formatDateTime(endedAt)) { pickingEnd = true }
                Box {
                    EditRow(
                        stringResource(R.string.fasting_target),
                        stringResource(R.string.fasting_target_hours, targetHours),
                    ) { showTargetMenu = true }
                    DropdownMenu(expanded = showTargetMenu, onDismissRequest = { showTargetMenu = false }) {
                        (TARGET_OPTIONS + targetHours).distinct().sorted().forEach { hours ->
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.fasting_target_hours, hours)) },
                                onClick = {
                                    showTargetMenu = false
                                    targetHours = hours
                                },
                            )
                        }
                    }
                }
                Text(
                    formatElapsed(endedAt - startedAt),
                    style = MaterialTheme.typography.bodySmall,
                    color =
                        if (valid) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                )
                TextButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.action_delete)) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onSave(
                        session.copy(
                            startedAtEpochMs = startedAt.toEpochMilliseconds(),
                            endedAtEpochMs = endedAt.toEpochMilliseconds(),
                            targetHours = targetHours,
                        ),
                    )
                },
            ) { Text(stringResource(R.string.fasting_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

@Composable
private fun EditRow(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Spacer(modifier = Modifier.width(6.dp))
        Icon(
            Icons.Default.Edit,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp),
        )
    }
}

/**
 * Picks a date and a time as one instant in the device zone. Both halves live in
 * a single dialog because a fast usually straddles midnight: "last night at 21:00"
 * is one decision, not two. Future instants are clamped to now on confirm.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FastingInstantDialog(
    title: String,
    initial: Instant,
    onDismiss: () -> Unit,
    onConfirm: (Instant) -> Unit,
) {
    val tz = TimeZone.currentSystemDefault()
    val initialLocal = initial.toLocalDateTime(tz)
    var date by remember(initial) { mutableStateOf(initialLocal.date) }
    var showDatePicker by remember { mutableStateOf(false) }
    val timeState =
        rememberTimePickerState(
            initialHour = initialLocal.hour,
            initialMinute = initialLocal.minute,
            is24Hour = true,
        )

    if (showDatePicker) {
        val dateState =
            rememberDatePickerState(
                initialSelectedDateMillis = date.toEpochDays().toLong() * 86_400_000L,
            )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    dateState.selectedDateMillis?.let { millis ->
                        date = Instant.fromEpochMilliseconds(millis).toLocalDateTime(TimeZone.UTC).date
                    }
                    showDatePicker = false
                }) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = dateState) }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val today =
                        Clock.System
                            .now()
                            .toLocalDateTime(tz)
                            .date
                    FilterChip(
                        selected = date == today,
                        onClick = { date = today },
                        label = { Text(stringResource(R.string.fasting_today)) },
                    )
                    FilterChip(
                        selected = date == today.minus(1, DateTimeUnit.DAY),
                        onClick = { date = today.minus(1, DateTimeUnit.DAY) },
                        label = { Text(stringResource(R.string.fasting_yesterday)) },
                    )
                    AssistChip(
                        onClick = { showDatePicker = true },
                        label = { Text(date.toString()) },
                    )
                }
                TimePicker(state = timeState)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val picked =
                    LocalDateTime(date, LocalTime(timeState.hour, timeState.minute))
                        .toInstant(tz)
                onConfirm(minOf(picked, Clock.System.now()))
            }) { Text(stringResource(R.string.dialog_ok)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

/** "21:00" when the fast started today, otherwise "Thu 21:00"-style date + time. */
private fun formatStartLabel(
    startedAt: Instant,
    now: Instant,
): String {
    val tz = TimeZone.currentSystemDefault()
    return if (startedAt.toLocalDateTime(tz).date == now.toLocalDateTime(tz).date) {
        formatTime(startedAt)
    } else {
        formatDateTime(startedAt)
    }
}

private fun formatDateTime(instant: Instant): String {
    val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
    val day =
        local.date.dayOfMonth
            .toString()
            .padStart(2, '0')
    val month =
        local.date.monthNumber
            .toString()
            .padStart(2, '0')
    return "$day.$month. ${formatTime(instant)}"
}

/** hh:mm:ss, matching the iOS elapsed timer. */
internal fun formatElapsed(duration: Duration): String {
    val total = duration.inWholeSeconds.coerceAtLeast(0)
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60
    return "$hours:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
}

private fun formatTime(instant: Instant): String {
    val local = instant.toLocalDateTime(TimeZone.currentSystemDefault())
    return "${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
}

private fun formatDate(instant: Instant): String = instant.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
