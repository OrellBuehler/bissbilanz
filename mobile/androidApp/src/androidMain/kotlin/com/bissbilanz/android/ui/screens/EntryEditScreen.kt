package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.EntryUpdate
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditScreen(
    entryId: String?,
    date: String?,
    navController: NavController,
) {
    val entryRepo: EntryRepository = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(entryId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var entry by remember { mutableStateOf<Entry?>(null) }
    val isEditing = entryId != null

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    // Form state
    var servings by remember { mutableStateOf("1") }
    var mealType by remember { mutableStateOf("breakfast") }
    var notes by remember { mutableStateOf("") }
    var quickName by remember { mutableStateOf("") }
    var quickCalories by remember { mutableStateOf("") }
    var quickProtein by remember { mutableStateOf("") }
    var quickCarbs by remember { mutableStateOf("") }
    var quickFat by remember { mutableStateOf("") }
    var quickFiber by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(entryId) {
        if (entryId != null) {
            try {
                // Load entries for the date to find this entry
                val entries = entryRepo.entries.value
                val found = entries.find { it.id == entryId }
                if (found != null) {
                    entry = found
                    servings = found.servings.let {
                        if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                    }
                    mealType = found.mealType
                    notes = found.notes ?: ""
                }
            } catch (_: Exception) {
                snackbarHostState.showSnackbar("Failed to load entry")
            }
            isLoading = false
        }
    }

    if (showDeleteDialog && entry != null) {
        val name = entry?.food?.name ?: entry?.recipe?.name ?: entry?.quickName ?: "Unknown"
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Entry") },
            text = { Text("Remove \"$name\" from your log?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                entryRepo.deleteEntry(entry!!.id)
                                navController.popBackStack()
                            } catch (_: Exception) {
                                snackbarHostState.showSnackbar("Failed to delete entry")
                            }
                        }
                        showDeleteDialog = false
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            },
        )
    }

    val mealOptions = listOf("breakfast", "lunch", "dinner", "snack")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEditing) "Edit Entry" else "Quick Add") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (isEditing && entry != null) {
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    IconButton(
                        onClick = {
                            isSaving = true
                            scope.launch {
                                try {
                                    if (isEditing && entry != null) {
                                        entryRepo.updateEntry(
                                            entry!!.id,
                                            EntryUpdate(
                                                mealType = mealType,
                                                servings = servings.toDoubleOrNull() ?: 1.0,
                                                notes = notes.ifBlank { null },
                                            ),
                                        )
                                    } else {
                                        entryRepo.createEntry(
                                            EntryCreate(
                                                mealType = mealType,
                                                servings = 1.0,
                                                date = date ?: today,
                                                quickName = quickName.trim().ifBlank { null },
                                                quickCalories = quickCalories.toDoubleOrNull(),
                                                quickProtein = quickProtein.toDoubleOrNull(),
                                                quickCarbs = quickCarbs.toDoubleOrNull(),
                                                quickFat = quickFat.toDoubleOrNull(),
                                                quickFiber = quickFiber.toDoubleOrNull(),
                                                notes = notes.ifBlank { null },
                                            ),
                                        )
                                    }
                                    navController.popBackStack()
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to save entry")
                                }
                                isSaving = false
                            }
                        },
                        enabled = !isSaving,
                    ) {
                        Icon(Icons.Default.Check, "Save")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (isLoading) {
            LoadingScreen()
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (isEditing && entry != null) {
                    // Show food name
                    val name = entry?.food?.name ?: entry?.recipe?.name ?: entry?.quickName ?: "Unknown"
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            entry?.food?.brand?.let {
                                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                // Meal type selection
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Meal Type",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            mealOptions.forEachIndexed { index, option ->
                                SegmentedButton(
                                    shape = SegmentedButtonDefaults.itemShape(index, mealOptions.size),
                                    onClick = { mealType = option },
                                    selected = mealType == option,
                                ) {
                                    Text(option.replaceFirstChar { it.uppercase() })
                                }
                            }
                        }
                    }
                }

                // Servings (only for editing)
                if (isEditing) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                "Servings",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            OutlinedTextField(
                                value = servings,
                                onValueChange = { servings = it },
                                label = { Text("Number of servings") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                        }
                    }
                }

                // Quick add fields (only for new entries)
                if (!isEditing) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                "Quick Entry",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            OutlinedTextField(
                                value = quickName,
                                onValueChange = { quickName = it },
                                label = { Text("Name *") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            NutrientTextField("Calories (kcal)", quickCalories, CaloriesBlue) { quickCalories = it }
                            NutrientTextField("Protein (g)", quickProtein, ProteinRed) { quickProtein = it }
                            NutrientTextField("Carbs (g)", quickCarbs, CarbsOrange) { quickCarbs = it }
                            NutrientTextField("Fat (g)", quickFat, FatYellow) { quickFat = it }
                            NutrientTextField("Fiber (g)", quickFiber, FiberGreen) { quickFiber = it }
                        }
                    }
                }

                // Notes
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Notes",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = notes,
                            onValueChange = { notes = it },
                            label = { Text("Notes (optional)") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 2,
                            maxLines = 4,
                        )
                    }
                }

                if (isSaving) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }

                Spacer(modifier = Modifier.height(80.dp))
            }
        }
    }
}
