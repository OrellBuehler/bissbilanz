package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.health.HealthConnectService
import com.bissbilanz.android.health.HealthSyncPreferences
import com.bissbilanz.android.tips.HelpSlugs
import com.bissbilanz.android.tips.HintCard
import com.bissbilanz.android.tips.TipIds
import com.bissbilanz.android.tips.TipStore
import com.bissbilanz.android.tips.openHelp
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.WeightTrendChart
import com.bissbilanz.android.ui.components.linearRegression
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.ui.theme.ProjectionPurple
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.WeightBlue
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.UiMessageSnackbar
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.android.util.formatIsoDate
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.formatDecimal1
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.time.Clock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeightScreen(navController: NavController) {
    val viewModel: WeightViewModel = koinViewModel()
    val weightRepo: WeightRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val tipStore: TipStore = koinInject()
    val healthConnect: HealthConnectService = koinInject()
    val healthSyncPrefs: HealthSyncPreferences = koinInject()
    val context = LocalContext.current
    // Read once per screen visit, like HealthConnectScreen's own toggles — this is not
    // a live sync target, just a one-time nudge to try the real thing.
    val healthConnectTipEligible =
        remember { healthConnect.isAvailable() && !healthSyncPrefs.readWeight }
    val dismissedTipIds by tipStore.dismissedIds.collectAsStateWithLifecycle()
    val showHealthConnectTip = healthConnectTipEligible && TipIds.HEALTH_CONNECT_WEIGHT !in dismissedTipIds
    val trendData by viewModel.trendData.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val selectedRange by viewModel.selectedRange.collectAsStateWithLifecycle()
    val projectionDays by viewModel.projectionDays.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()

    var showAddDialog by remember { mutableStateOf(false) }
    var showTargetDialog by remember { mutableStateOf(false) }
    var entryToDelete by remember { mutableStateOf<WeightEntry?>(null) }
    var entryToEdit by remember { mutableStateOf<WeightEntry?>(null) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()

    UiMessageSnackbar(snackbarMessage, snackbarHostState, viewModel::clearSnackbar)

    val ranges = listOf("7d", "30d", "90d", stringResource(R.string.weight_range_all))
    val projectionOptions = listOf(0, 14, 30, 60)
    val projectionLabels = listOf(stringResource(R.string.weight_projection_off), "14d", "30d", "60d")

    val loggedMessage = stringResource(R.string.weight_logged_success)
    val logFailedMessage = stringResource(R.string.weight_log_failed)
    val updatedMessage = stringResource(R.string.weight_update_success)
    val updateFailedMessage = stringResource(R.string.weight_update_failed)
    val deleteFailedMessage = stringResource(R.string.sleep_delete_failed)

    if (showTargetDialog) {
        WeightTargetDialog(
            initialTargetKg = goals?.targetWeightKg,
            initialTargetDate = goals?.targetDate,
            onDismiss = { showTargetDialog = false },
            onSave = { kg, date ->
                viewModel.setTarget(kg, date)
                showTargetDialog = false
            },
        )
    }

    if (showAddDialog) {
        AddWeightDialog(
            onDismiss = { showAddDialog = false },
            onSave = { weight, notes ->
                haptic(HapticFeedbackType.LongPress)
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        weightRepo.createEntry(WeightCreate(weightKg = weight, entryDate = today, notes = notes.ifBlank { null }))
                        viewModel.refreshTrend()
                        snackbarHostState.showSnackbar(loggedMessage)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(logFailedMessage)
                    }
                }
                showAddDialog = false
            },
        )
    }

    entryToEdit?.let { entry ->
        EditWeightDialog(
            entry = entry,
            onDismiss = { entryToEdit = null },
            onSave = { weight, notes ->
                scope.launch {
                    try {
                        weightRepo.updateEntry(
                            entry.id,
                            WeightUpdate(weightKg = weight, notes = notes.ifBlank { null }),
                        )
                        viewModel.refreshTrend()
                        snackbarHostState.showSnackbar(updatedMessage)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(updateFailedMessage)
                    }
                }
                entryToEdit = null
            },
        )
    }

    entryToDelete?.let { entry ->
        AlertDialog(
            onDismissRequest = { entryToDelete = null },
            title = { Text(stringResource(R.string.weight_delete_title)) },
            text = { Text(stringResource(R.string.weight_delete_text, formatIsoDate(entry.entryDate))) },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                weightRepo.deleteEntry(entry.id)
                                viewModel.refreshTrend()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                snackbarHostState.showSnackbar(deleteFailedMessage)
                            }
                        }
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

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            AppTopBar(
                scrollBehavior = scrollBehavior,
                title = stringResource(R.string.weight_screen_title),
                onBack = { navController.popBackStack() },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    haptic(HapticFeedbackType.LongPress)
                    showAddDialog = true
                },
            ) {
                Icon(Icons.Default.Add, stringResource(R.string.weight_add_content_desc))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading && entries.isEmpty(), label = "weight") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (entries.isEmpty() && trendData.isEmpty()) {
                    EmptyState(stringResource(R.string.weight_empty))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding =
                            PaddingValues(
                                start = Dimens.ScreenPadding,
                                top = Dimens.ListGap,
                                end = Dimens.ScreenPadding,
                                bottom = Dimens.FabClearance,
                            ),
                    ) {
                        if (showHealthConnectTip) {
                            item {
                                HintCard(
                                    title = stringResource(R.string.tip_health_connect_weight_title),
                                    text = stringResource(R.string.tip_health_connect_weight_text),
                                    onLearnMore = {
                                        openHelp(context, HelpSlugs.MOBILE_EXTRAS)
                                        tipStore.dismiss(TipIds.HEALTH_CONNECT_WEIGHT)
                                    },
                                    onDismiss = { tipStore.dismiss(TipIds.HEALTH_CONNECT_WEIGHT) },
                                )
                            }
                        }

                        // Weight target
                        item {
                            WeightTargetCard(
                                targetWeightKg = goals?.targetWeightKg,
                                targetDate = goals?.targetDate,
                                latestWeightKg = entries.firstOrNull()?.weightKg,
                                onEdit = { showTargetDialog = true },
                            )
                        }

                        // Stats chips
                        if (trendData.isNotEmpty()) {
                            item {
                                WeightStatsRow(trendData = trendData, projectionDays = projectionDays)
                            }
                        }

                        // Range selector
                        item {
                            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                ranges.forEachIndexed { index, label ->
                                    SegmentedButton(
                                        selected = selectedRange == index,
                                        onClick = { viewModel.selectRange(index) },
                                        shape = SegmentedButtonDefaults.itemShape(index, ranges.size),
                                    ) {
                                        Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }

                        // Projection selector
                        if (trendData.size >= 3) {
                            item {
                                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                    projectionOptions.forEachIndexed { index, days ->
                                        SegmentedButton(
                                            selected = projectionDays == days,
                                            onClick = { viewModel.setProjectionDays(days) },
                                            shape = SegmentedButtonDefaults.itemShape(index, projectionOptions.size),
                                        ) {
                                            Text(projectionLabels[index], maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                }
                            }
                        }

                        // Trend chart
                        if (trendData.isNotEmpty()) {
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    WeightTrendChart(
                                        trendData = trendData,
                                        projectionDays = projectionDays,
                                        modifier = Modifier.fillMaxWidth().height(240.dp).padding(Dimens.CardPadding),
                                    )
                                }
                            }
                        }

                        // Entry list
                        items(entries, key = { it.id }) { entry ->
                            Card(modifier = Modifier.fillMaxWidth().animateItem()) {
                                ListItem(
                                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                    headlineContent = {
                                        Text(
                                            stringResource(R.string.weight_kg_value, entry.weightKg.formatDecimal1()),
                                            fontWeight = FontWeight.Bold,
                                        )
                                    },
                                    supportingContent = {
                                        Column {
                                            Text(formatIsoDate(entry.entryDate))
                                            entry.notes?.let {
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
                                                Icon(Icons.Default.Edit, stringResource(R.string.weight_edit_content_desc))
                                            }
                                            IconButton(onClick = { entryToDelete = entry }) {
                                                Icon(
                                                    Icons.Default.Delete,
                                                    stringResource(R.string.weight_delete_content_desc),
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

/**
 * A simple "Target X kg by DATE" line plus the remaining delta from the latest
 * weight — no forecast maths, matching what the task asked for (the web page's
 * fuller goal-projection card is not mirrored here).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeightTargetCard(
    targetWeightKg: Double?,
    targetDate: String?,
    latestWeightKg: Double?,
    onEdit: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(Dimens.CardPadding),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                if (targetWeightKg != null) {
                    Text(
                        if (targetDate != null) {
                            stringResource(R.string.weight_target_line, targetWeightKg.formatDecimal1(), formatIsoDate(targetDate))
                        } else {
                            stringResource(R.string.weight_target_line_no_date, targetWeightKg.formatDecimal1())
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    if (latestWeightKg != null) {
                        val remaining = latestWeightKg - targetWeightKg
                        Text(
                            if (kotlin.math.abs(remaining) < 0.05) {
                                stringResource(R.string.weight_target_reached)
                            } else {
                                stringResource(R.string.weight_target_remaining, kotlin.math.abs(remaining).formatDecimal1())
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    Text(
                        stringResource(R.string.weight_target_set),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Default.Edit, stringResource(R.string.weight_target_edit_content_desc))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WeightTargetDialog(
    initialTargetKg: Double?,
    initialTargetDate: String?,
    onDismiss: () -> Unit,
    onSave: (Double?, String?) -> Unit,
) {
    var kgDraft by remember { mutableStateOf(initialTargetKg?.formatDecimal1() ?: "") }
    val parsedKg = kgDraft.toLocalizedDoubleOrNull()?.takeIf { it > 0 }
    val kgInvalid = kgDraft.isNotBlank() && parsedKg == null
    var dateDraft by remember { mutableStateOf(initialTargetDate) }
    var showDatePicker by remember { mutableStateOf(false) }

    if (showDatePicker) {
        val initialMillis =
            dateDraft?.let { runCatching { LocalDate.parse(it).toEpochDays().toLong() * 86_400_000L }.getOrNull() }
        val dateState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    dateState.selectedDateMillis?.let { millis ->
                        dateDraft =
                            kotlinx.datetime.Instant
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
        ) { DatePicker(state = dateState) }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.weight_target_dialog_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = kgDraft,
                    onValueChange = { kgDraft = it },
                    label = { Text(stringResource(R.string.weight_target_kg_label)) },
                    isError = kgInvalid,
                    supportingText =
                        if (kgInvalid) {
                            { Text(stringResource(R.string.weight_target_invalid)) }
                        } else {
                            null
                        },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(12.dp))
                AssistChip(
                    onClick = { showDatePicker = true },
                    label = { Text(dateDraft?.let { formatIsoDate(it) } ?: stringResource(R.string.weight_target_date_label)) },
                )
            }
        },
        confirmButton = {
            // A blank field clears the target; anything else must be a valid weight
            // instead of silently clearing it.
            TextButton(
                onClick = { onSave(parsedKg, if (parsedKg != null) dateDraft else null) },
                enabled = !kgInvalid,
            ) { Text(stringResource(R.string.weight_save)) }
        },
        dismissButton = {
            Row {
                if (initialTargetKg != null) {
                    TextButton(onClick = { onSave(null, null) }) { Text(stringResource(R.string.weight_target_clear)) }
                }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.weight_cancel)) }
            }
        },
    )
}

@Composable
private fun WeightStatsRow(
    trendData: List<com.bissbilanz.model.WeightTrendEntry>,
    projectionDays: Int,
) {
    val errorReporter: ErrorReporter = koinInject()
    val latest = trendData.lastOrNull() ?: return
    val first = trendData.firstOrNull() ?: return
    val delta = latest.weightKg - first.weightKg
    val deltaColor =
        when {
            delta > 0 -> MaterialTheme.colorScheme.error
            delta < 0 -> TrendGreen
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        }
    val deltaSign = if (delta > 0) "+" else ""

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Surface(
            shape = CircleShape,
            color = WeightBlue.copy(alpha = 0.1f),
            contentColor = WeightBlue.macroTextTone(),
        ) {
            Text(
                stringResource(R.string.weight_kg_value, latest.weightKg.formatDecimal1()),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }

        latest.movingAvg?.let { avg ->
            Surface(
                shape = CircleShape,
                color = TrendGreen.copy(alpha = 0.1f),
                contentColor = TrendGreen.macroTextTone(),
            ) {
                Text(
                    stringResource(R.string.weight_stats_trend, avg.formatDecimal1()),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }

        Surface(
            shape = CircleShape,
            color = deltaColor.copy(alpha = 0.1f),
            contentColor = deltaColor.macroTextTone(),
        ) {
            Text(
                stringResource(R.string.weight_stats_delta, "$deltaSign${delta.formatDecimal1()}"),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }

        if (projectionDays > 0 && trendData.size >= 3) {
            val projectedWeight =
                try {
                    val firstDate = LocalDate.parse(trendData.first().entryDate.take(10))
                    val regressionPoints =
                        trendData.map { entry ->
                            val date = LocalDate.parse(entry.entryDate.take(10))
                            (date.toEpochDays() - firstDate.toEpochDays()).toFloat() to entry.weightKg.toFloat()
                        }
                    val lastDayIndex = regressionPoints.last().first
                    val (slope, intercept) = linearRegression(regressionPoints) ?: (0f to trendData.last().weightKg.toFloat())
                    slope * (lastDayIndex + projectionDays) + intercept
                } catch (e: Exception) {
                    errorReporter.captureException(e)
                    null
                }

            if (projectedWeight != null) {
                Surface(
                    shape = CircleShape,
                    color = ProjectionPurple.copy(alpha = 0.1f),
                    contentColor = ProjectionPurple.macroTextTone(),
                ) {
                    Text(
                        stringResource(R.string.weight_stats_projected, projectedWeight.formatDecimal1()),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
fun AddWeightDialog(
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    var weightText by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.weight_log_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text(stringResource(R.string.weight_input_label)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(stringResource(R.string.weight_notes_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val weight = weightText.toLocalizedDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text(stringResource(R.string.weight_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.weight_cancel)) }
        },
    )
}

@Composable
fun EditWeightDialog(
    entry: WeightEntry,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    var weightText by remember { mutableStateOf(entry.weightKg.formatDecimal1()) }
    var notes by remember { mutableStateOf(entry.notes ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.weight_edit_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text(stringResource(R.string.weight_input_label)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(stringResource(R.string.weight_notes_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val weight = weightText.toLocalizedDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text(stringResource(R.string.weight_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.weight_cancel)) }
        },
    )
}
