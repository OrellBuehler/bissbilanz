package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.screens.NutrientTextField
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
fun EntryEditSheet(
    entryId: String?,
    date: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val entryRepo: EntryRepository = koinInject()
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
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
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(entryId) {
        if (entryId != null) {
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
        }
    }

    if (showDeleteDialog && entry != null) {
        val name =
            entry?.food?.name ?: entry?.recipe?.name ?: entry?.quickName ?: "Unknown"
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
                                onSaved()
                            } catch (_: Exception) {
                                errorMessage = "Failed to delete entry"
                            }
                        }
                        showDeleteDialog = false
                    },
                    colors =
                        ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            },
        )
    }

    val mealOptions = listOf("breakfast", "lunch", "dinner", "snack")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp)
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    if (isEditing) "Edit Entry" else "Quick Add",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                if (isEditing && entry != null) {
                    IconButton(onClick = { showDeleteDialog = true }) {
                        Icon(
                            Icons.Default.Delete,
                            "Delete",
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            if (isEditing && entry != null) {
                val name =
                    entry?.food?.name ?: entry?.recipe?.name
                        ?: entry?.quickName ?: "Unknown"
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        entry?.food?.brand?.let {
                            Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            // Meal type
            Text("Meal Type", style = MaterialTheme.typography.labelLarge)
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                mealOptions.forEachIndexed { index, option ->
                    SegmentedButton(
                        shape =
                            SegmentedButtonDefaults.itemShape(
                                index,
                                mealOptions.size,
                            ),
                        onClick = { mealType = option },
                        selected = mealType == option,
                    ) {
                        Text(option.replaceFirstChar { it.uppercase() })
                    }
                }
            }

            // Servings (edit mode)
            if (isEditing) {
                OutlinedTextField(
                    value = servings,
                    onValueChange = { servings = it },
                    label = { Text("Servings") },
                    keyboardOptions =
                        KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            // Quick add fields
            if (!isEditing) {
                OutlinedTextField(
                    value = quickName,
                    onValueChange = { quickName = it },
                    label = { Text("Name *") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                NutrientTextField("Calories (kcal)", quickCalories, CaloriesBlue) {
                    quickCalories = it
                }
                NutrientTextField("Protein (g)", quickProtein, ProteinRed) {
                    quickProtein = it
                }
                NutrientTextField("Carbs (g)", quickCarbs, CarbsOrange) {
                    quickCarbs = it
                }
                NutrientTextField("Fat (g)", quickFat, FatYellow) { quickFat = it }
                NutrientTextField("Fiber (g)", quickFiber, FiberGreen) {
                    quickFiber = it
                }
            }

            // Notes
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
            )

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
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Cancel")
                }
                Button(
                    onClick = {
                        isSaving = true
                        scope.launch {
                            try {
                                if (isEditing && entry != null) {
                                    entryRepo.updateEntry(
                                        entry!!.id,
                                        EntryUpdate(
                                            mealType = mealType,
                                            servings =
                                                servings.toDoubleOrNull() ?: 1.0,
                                            notes = notes.ifBlank { null },
                                        ),
                                    )
                                } else {
                                    entryRepo.createEntry(
                                        EntryCreate(
                                            mealType = mealType,
                                            servings = 1.0,
                                            date = date ?: today,
                                            quickName =
                                                quickName.trim().ifBlank { null },
                                            quickCalories =
                                                quickCalories.toDoubleOrNull(),
                                            quickProtein =
                                                quickProtein.toDoubleOrNull(),
                                            quickCarbs =
                                                quickCarbs.toDoubleOrNull(),
                                            quickFat = quickFat.toDoubleOrNull(),
                                            quickFiber =
                                                quickFiber.toDoubleOrNull(),
                                            notes = notes.ifBlank { null },
                                        ),
                                    )
                                }
                                onSaved()
                            } catch (_: Exception) {
                                errorMessage = "Failed to save entry"
                            }
                            isSaving = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isSaving,
                ) {
                    Text("Save")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
