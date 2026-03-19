package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.*
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.util.toDisplayString
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private data class SupplementIngredientRow(
    val name: String = "",
    val dosage: String = "",
    val dosageUnit: String = "mg",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementEditSheet(
    supplementId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val supplementRepo: SupplementRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isLoading by remember { mutableStateOf(supplementId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val isEditing = supplementId != null

    var name by remember { mutableStateOf("") }
    var dosage by remember { mutableStateOf("") }
    var dosageUnit by remember { mutableStateOf("mg") }
    var scheduleType by remember { mutableStateOf(ScheduleType.DAILY) }
    var timeOfDay by remember { mutableStateOf("morning") }
    var isActive by remember { mutableStateOf(true) }

    var ingredients by remember { mutableStateOf(listOf<SupplementIngredientRow>()) }

    LaunchedEffect(supplementId) {
        if (supplementId != null) {
            try {
                val supplements = supplementRepo.supplements().first()
                val found = supplements.find { it.id == supplementId }
                if (found != null) {
                    name = found.name
                    dosage = found.dosage.toDisplayString()
                    dosageUnit = found.dosageUnit
                    scheduleType = found.scheduleType
                    timeOfDay = found.timeOfDay ?: "morning"
                    isActive = found.isActive
                    ingredients = found.ingredients?.map { ing ->
                        SupplementIngredientRow(
                            name = ing.name,
                            dosage = ing.dosage.toDisplayString(),
                            dosageUnit = ing.dosageUnit,
                        )
                    } ?: emptyList()
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e("SupplementEditSheet", "Failed to load supplement", e)
                errorReporter.captureException(e)
                errorMessage = "Failed to load supplement"
            }
            isLoading = false
        }
    }

    val timeOptions = listOf("morning", "noon", "evening", "anytime")
    val unitOptions = listOf("mg", "mcg", "g", "IU", "ml", "drops", "capsules", "tablets")

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
                Text(
                    if (isEditing) "Edit Supplement" else "Add Supplement",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                // Basic info
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name *") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = dosage,
                        onValueChange = { dosage = it },
                        label = { Text("Dosage *") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    var showUnitMenu by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = showUnitMenu,
                        onExpandedChange = { showUnitMenu = it },
                        modifier = Modifier.weight(1f),
                    ) {
                        OutlinedTextField(
                            value = dosageUnit,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Unit") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = showUnitMenu)
                            },
                            modifier = Modifier.menuAnchor(),
                            singleLine = true,
                        )
                        ExposedDropdownMenu(
                            expanded = showUnitMenu,
                            onDismissRequest = { showUnitMenu = false },
                        ) {
                            unitOptions.forEach { unit ->
                                DropdownMenuItem(
                                    text = { Text(unit) },
                                    onClick = {
                                        dosageUnit = unit
                                        showUnitMenu = false
                                    },
                                )
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Active")
                    Switch(checked = isActive, onCheckedChange = { isActive = it })
                }

                HorizontalDivider()

                // Schedule
                Text(
                    "Schedule",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text("Frequency", style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val displayOptions =
                        listOf(
                            "Daily" to ScheduleType.DAILY,
                            "Every 2d" to ScheduleType.EVERY_OTHER_DAY,
                        )
                    displayOptions.forEachIndexed { index, (label, type) ->
                        SegmentedButton(
                            shape =
                                SegmentedButtonDefaults.itemShape(
                                    index,
                                    displayOptions.size,
                                ),
                            onClick = { scheduleType = type },
                            selected = scheduleType == type,
                        ) {
                            Text(label)
                        }
                    }
                }

                Text("Time of day", style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    timeOptions.forEachIndexed { index, option ->
                        SegmentedButton(
                            shape =
                                SegmentedButtonDefaults.itemShape(
                                    index,
                                    timeOptions.size,
                                ),
                            onClick = { timeOfDay = option },
                            selected = timeOfDay == option,
                        ) {
                            Text(option.replaceFirstChar { it.uppercase() })
                        }
                    }
                }

                HorizontalDivider()

                // Ingredients
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Ingredients (${ingredients.size})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    FilledTonalButton(onClick = {
                        ingredients = ingredients + SupplementIngredientRow()
                    }) {
                        Icon(Icons.Default.Add, "Add", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Add")
                    }
                }

                ingredients.forEachIndexed { index, ingredient ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors =
                            CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            ),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    "Ingredient ${index + 1}",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                IconButton(
                                    onClick = {
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                removeAt(index)
                                            }
                                    },
                                    modifier = Modifier.size(32.dp),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        "Remove",
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                            OutlinedTextField(
                                value = ingredient.name,
                                onValueChange = { newName ->
                                    ingredients =
                                        ingredients.toMutableList().apply {
                                            set(index, ingredient.copy(name = newName))
                                        }
                                },
                                label = { Text("Name") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = ingredient.dosage,
                                    onValueChange = { newDosage ->
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                set(index, ingredient.copy(dosage = newDosage))
                                            }
                                    },
                                    label = { Text("Dosage") },
                                    keyboardOptions =
                                        KeyboardOptions(
                                            keyboardType = KeyboardType.Decimal,
                                        ),
                                    modifier = Modifier.weight(1f),
                                    singleLine = true,
                                )
                                OutlinedTextField(
                                    value = ingredient.dosageUnit,
                                    onValueChange = { newUnit ->
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                set(index, ingredient.copy(dosageUnit = newUnit))
                                            }
                                    },
                                    label = { Text("Unit") },
                                    modifier = Modifier.weight(0.6f),
                                    singleLine = true,
                                )
                            }
                        }
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
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            if (name.isBlank() || dosage.toDoubleOrNull() == null) return@Button
                            isSaving = true
                            scope.launch {
                                try {
                                    val create =
                                        SupplementCreate(
                                            name = name.trim(),
                                            dosage = dosage.toDoubleOrNull() ?: 0.0,
                                            dosageUnit = dosageUnit,
                                            scheduleType = scheduleType,
                                            timeOfDay = timeOfDay,
                                            isActive = isActive,
                                            ingredients =
                                                ingredients
                                                    .filter { it.name.isNotBlank() }
                                                    .mapIndexed { idx, ing ->
                                                        SupplementIngredientInput(
                                                            name = ing.name.trim(),
                                                            dosage = ing.dosage.toDoubleOrNull() ?: 0.0,
                                                            dosageUnit = ing.dosageUnit,
                                                            sortOrder = idx,
                                                        )
                                                    },
                                        )
                                    if (isEditing) {
                                        val id = supplementId ?: return@launch
                                        supplementRepo.updateSupplement(id, create)
                                    } else {
                                        supplementRepo.createSupplement(create)
                                    }
                                    sheetState.hide()
                                    onSaved()
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    Log.e("SupplementEditSheet", "Failed to save supplement", e)
                                    errorReporter.captureException(e)
                                    errorMessage = "Failed to save supplement"
                                }
                                isSaving = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && name.isNotBlank(),
                    ) {
                        Text("Save")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
