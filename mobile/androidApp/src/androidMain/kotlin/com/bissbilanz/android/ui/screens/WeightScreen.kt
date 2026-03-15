package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeightScreen(navController: NavController) {
    val weightRepo: WeightRepository = koinInject()
    val entries by weightRepo.entries().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    var showAddDialog by remember { mutableStateOf(false) }
    var entryToDelete by remember { mutableStateOf<WeightEntry?>(null) }
    var entryToEdit by remember { mutableStateOf<WeightEntry?>(null) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            weightRepo.refresh()
        } catch (_: Exception) {
        }
        isLoading = false
    }

    if (showAddDialog) {
        AddWeightDialog(
            onDismiss = { showAddDialog = false },
            onSave = { weight, notes ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        weightRepo.createEntry(WeightCreate(weightKg = weight, entryDate = today, notes = notes.ifBlank { null }))
                        snackbarHostState.showSnackbar("Weight logged")
                    } catch (_: Exception) {
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
                        snackbarHostState.showSnackbar("Weight updated")
                    } catch (_: Exception) {
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
                            } catch (_: Exception) {
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
            } else if (entries.isEmpty()) {
                EmptyState("No weight entries yet.\nTap + to log your weight.")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(bottom = 80.dp, top = 8.dp),
                ) {
                    item {
                        if (entries.size >= 2) {
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text("Trend", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    val weights = entries.reversed().map { it.weightKg.toFloat() }
                                    SimpleLineChart(
                                        data = weights,
                                        color = CaloriesBlue,
                                        modifier = Modifier.fillMaxWidth().height(120.dp),
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(
                                            "${weights.min().let { "%.1f".format(it) }} kg",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            "${weights.max().let { "%.1f".format(it) }} kg",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }

                    items(entries) { entry ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            ListItem(
                                headlineContent = {
                                    Text("${"%.1f".format(entry.weightKg)} kg", fontWeight = FontWeight.Bold)
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
                    val weight = weightText.toDoubleOrNull()
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
    var weightText by remember { mutableStateOf("%.1f".format(entry.weightKg)) }
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
                    val weight = weightText.toDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
