package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.WeightTrendChart
import com.bissbilanz.android.ui.components.linearRegression
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.ProjectionPurple
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.WeightBlue
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.formatDecimal1
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.time.Clock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeightScreen(navController: NavController) {
    val viewModel: WeightViewModel = koinViewModel()
    val weightRepo: WeightRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val trendData by viewModel.trendData.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val selectedRange by viewModel.selectedRange.collectAsStateWithLifecycle()
    val projectionDays by viewModel.projectionDays.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()

    var showAddDialog by remember { mutableStateOf(false) }
    var entryToDelete by remember { mutableStateOf<WeightEntry?>(null) }
    var entryToEdit by remember { mutableStateOf<WeightEntry?>(null) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()

    val ranges = listOf("7d", "30d", "90d", stringResource(R.string.weight_range_all))
    val projectionOptions = listOf(0, 14, 30, 60)
    val projectionLabels = listOf(stringResource(R.string.weight_projection_off), "14d", "30d", "60d")

    val loggedMessage = stringResource(R.string.weight_logged_success)
    val logFailedMessage = stringResource(R.string.weight_log_failed)
    val updatedMessage = stringResource(R.string.weight_update_success)
    val updateFailedMessage = stringResource(R.string.weight_update_failed)
    val deleteFailedMessage = stringResource(R.string.sleep_delete_failed)

    if (showAddDialog) {
        AddWeightDialog(
            onDismiss = { showAddDialog = false },
            onSave = { weight, notes ->
                haptic(HapticFeedbackType.LongPress)
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        weightRepo.createEntry(WeightCreate(weightKg = weight, entryDate = today, notes = notes.ifBlank { null }))
                        viewModel.refresh()
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
                        viewModel.refresh()
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
            text = { Text(stringResource(R.string.weight_delete_text, entry.entryDate)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                weightRepo.deleteEntry(entry.id)
                                viewModel.refresh()
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.weight_screen_title)) },
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
                    showAddDialog = true
                },
            ) {
                Icon(Icons.Default.Add, stringResource(R.string.weight_add_content_desc))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                viewModel.refreshTrend()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading, label = "weight") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (entries.isEmpty() && trendData.isEmpty()) {
                    EmptyState(stringResource(R.string.weight_empty))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 80.dp, top = 8.dp),
                    ) {
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
                                        Text(label)
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
                                            Text(projectionLabels[index])
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
                                        modifier = Modifier.fillMaxWidth().height(240.dp).padding(12.dp),
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
                                            Text(entry.entryDate)
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeightStatsRow(
    trendData: List<com.bissbilanz.model.WeightTrendEntry>,
    projectionDays: Int,
) {
    val latest = trendData.lastOrNull() ?: return
    val first = trendData.firstOrNull() ?: return
    val delta = latest.weightKg - first.weightKg
    val deltaColor =
        when {
            delta > 0 -> CarbsOrange
            delta < 0 -> TrendGreen
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        }
    val deltaSign = if (delta > 0) "+" else ""

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = WeightBlue.copy(alpha = 0.1f),
            contentColor = WeightBlue,
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
                shape = RoundedCornerShape(20.dp),
                color = TrendGreen.copy(alpha = 0.1f),
                contentColor = TrendGreen,
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
            shape = RoundedCornerShape(20.dp),
            color = deltaColor.copy(alpha = 0.1f),
            contentColor = deltaColor,
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
                } catch (_: Exception) {
                    null
                }

            if (projectedWeight != null) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = ProjectionPurple.copy(alpha = 0.1f),
                    contentColor = ProjectionPurple,
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
