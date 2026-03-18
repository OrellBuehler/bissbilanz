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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.WeightTrendChart
import com.bissbilanz.android.ui.components.linearRegression
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.ProjectionPurple
import com.bissbilanz.android.ui.theme.TrendGreen
import com.bissbilanz.android.ui.theme.WeightBlue
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeightScreen(navController: NavController) {
    val viewModel: WeightViewModel = koinViewModel()
    val weightRepo: WeightRepository = koinInject()
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

    val ranges = listOf("7d", "30d", "90d", "All")
    val projectionOptions = listOf(0, 14, 30, 60)
    val projectionLabels = listOf("Off", "14d", "30d", "60d")

    if (showAddDialog) {
        AddWeightDialog(
            onDismiss = { showAddDialog = false },
            onSave = { weight, notes ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        weightRepo.createEntry(WeightCreate(weightKg = weight, entryDate = today, notes = notes.ifBlank { null }))
                        viewModel.refresh()
                        snackbarHostState.showSnackbar("Weight logged")
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        snackbarHostState.showSnackbar("Failed to log weight")
                    }
                }
                showAddDialog = false
            },
        )
    }

    if (entryToEdit != null) {
        EditWeightDialog(
            entry = entryToEdit!!,
            onDismiss = { entryToEdit = null },
            onSave = { weight, notes ->
                scope.launch {
                    try {
                        weightRepo.updateEntry(
                            entryToEdit!!.id,
                            WeightUpdate(weightKg = weight, notes = notes.ifBlank { null }),
                        )
                        viewModel.refresh()
                        snackbarHostState.showSnackbar("Weight updated")
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        snackbarHostState.showSnackbar("Failed to update weight")
                    }
                }
                entryToEdit = null
            },
        )
    }

    if (entryToDelete != null) {
        AlertDialog(
            onDismissRequest = { entryToDelete = null },
            title = { Text("Delete Weight Entry") },
            text = { Text("Delete entry from ${entryToDelete!!.entryDate}?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                weightRepo.deleteEntry(entryToDelete!!.id)
                                viewModel.refresh()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                snackbarHostState.showSnackbar("Failed to delete")
                            }
                        }
                        entryToDelete = null
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { entryToDelete = null }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Weight Log") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, "Add weight")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Crossfade(targetState = isLoading, label = "weight") { loading ->
            if (loading) {
                LoadingScreen()
            } else if (entries.isEmpty() && trendData.isEmpty()) {
                EmptyState("No weight entries yet.\nTap + to log your weight.")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
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
                                headlineContent = {
                                    Text("%s kg".format(String.format(Locale.US, "%.1f", entry.weightKg)), fontWeight = FontWeight.Bold)
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
                                            Icon(Icons.Default.Edit, "Edit")
                                        }
                                        IconButton(onClick = { entryToDelete = entry }) {
                                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
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
                "%s kg".format(String.format(Locale.US, "%.1f", latest.weightKg)),
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
                    "Trend %s kg".format(String.format(Locale.US, "%.1f", avg)),
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
                "Δ $deltaSign%s kg".format(String.format(Locale.US, "%.1f", delta)),
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
                        "Projected %s kg".format(String.format(Locale.US, "%.1f", projectedWeight)),
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
        title = { Text("Log Weight") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text("Weight (kg)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val weight = weightText.replace(',', '.').toDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun EditWeightDialog(
    entry: WeightEntry,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    var weightText by remember { mutableStateOf(String.format(Locale.US, "%.1f", entry.weightKg)) }
    var notes by remember { mutableStateOf(entry.notes ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Weight") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text("Weight (kg)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val weight = weightText.replace(',', '.').toDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
