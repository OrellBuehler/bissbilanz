package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.model.*
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementEditScreen(
    supplementId: String?,
    navController: NavController,
) {
    val supplementRepo: SupplementRepository = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(supplementId != null) }
    var isSaving by remember { mutableStateOf(false) }
    val isEditing = supplementId != null

    var name by remember { mutableStateOf("") }
    var dosage by remember { mutableStateOf("") }
    var dosageUnit by remember { mutableStateOf("mg") }
    var scheduleType by remember { mutableStateOf(ScheduleType.DAILY) }
    var timeOfDay by remember { mutableStateOf("morning") }
    var isActive by remember { mutableStateOf(true) }

    data class IngredientRow(
        val name: String = "",
        val dosage: String = "",
        val dosageUnit: String = "mg",
    )

    var ingredients by remember { mutableStateOf(listOf<IngredientRow>()) }

    LaunchedEffect(supplementId) {
        if (supplementId != null) {
            try {
                val supplements = supplementRepo.supplements.value
                val found = supplements.find { it.id == supplementId }
                if (found != null) {
                    name = found.name
                    dosage = found.dosage.let {
                        if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                    }
                    dosageUnit = found.dosageUnit
                    scheduleType = found.scheduleType
                    timeOfDay = found.timeOfDay ?: "morning"
                    isActive = found.isActive
                    ingredients = found.ingredients?.map { ing ->
                        IngredientRow(
                            name = ing.name,
                            dosage = ing.dosage.let {
                                if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                            },
                            dosageUnit = ing.dosageUnit,
                        )
                    } ?: emptyList()
                }
            } catch (_: Exception) {
                snackbarHostState.showSnackbar("Failed to load supplement")
            }
            isLoading = false
        }
    }

    val scheduleOptions = ScheduleType.entries
    val timeOptions = listOf("morning", "noon", "evening", "anytime")
    val unitOptions = listOf("mg", "mcg", "g", "IU", "ml", "drops", "capsules", "tablets")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEditing) "Edit Supplement" else "Add Supplement") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (name.isBlank() || dosage.toDoubleOrNull() == null) return@IconButton
                            isSaving = true
                            scope.launch {
                                try {
                                    val create = SupplementCreate(
                                        name = name.trim(),
                                        dosage = dosage.toDoubleOrNull() ?: 0.0,
                                        dosageUnit = dosageUnit,
                                        scheduleType = scheduleType,
                                        timeOfDay = timeOfDay,
                                        isActive = isActive,
                                        ingredients = ingredients
                                            .filter { it.name.isNotBlank() }
                                            .mapIndexed { index, ing ->
                                                SupplementIngredientInput(
                                                    name = ing.name.trim(),
                                                    dosage = ing.dosage.toDoubleOrNull() ?: 0.0,
                                                    dosageUnit = ing.dosageUnit,
                                                    sortOrder = index,
                                                )
                                            },
                                    )
                                    if (isEditing) {
                                        supplementRepo.updateSupplement(supplementId!!, create)
                                    } else {
                                        supplementRepo.createSupplement(create)
                                    }
                                    navController.popBackStack()
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to save supplement")
                                }
                                isSaving = false
                            }
                        },
                        enabled = !isSaving && name.isNotBlank(),
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
                // Basic info
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            "Supplement Info",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
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
                    }
                }

                // Schedule
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "Schedule",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text("Frequency", style = MaterialTheme.typography.labelLarge)
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            val displayOptions = listOf("Daily" to ScheduleType.DAILY, "Every 2d" to ScheduleType.EVERY_OTHER_DAY)
                            displayOptions.forEachIndexed { index, (label, type) ->
                                SegmentedButton(
                                    shape = SegmentedButtonDefaults.itemShape(index, displayOptions.size),
                                    onClick = { scheduleType = type },
                                    selected = scheduleType == type,
                                ) {
                                    Text(label)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Time of day", style = MaterialTheme.typography.labelLarge)
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            timeOptions.forEachIndexed { index, option ->
                                SegmentedButton(
                                    shape = SegmentedButtonDefaults.itemShape(index, timeOptions.size),
                                    onClick = { timeOfDay = option },
                                    selected = timeOfDay == option,
                                ) {
                                    Text(option.replaceFirstChar { it.uppercase() })
                                }
                            }
                        }
                    }
                }

                // Ingredients
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
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
                                ingredients = ingredients + IngredientRow()
                            }) {
                                Icon(Icons.Default.Add, "Add", modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Add")
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        ingredients.forEachIndexed { index, ingredient ->
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                ),
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text("Ingredient ${index + 1}", style = MaterialTheme.typography.labelLarge)
                                        IconButton(
                                            onClick = {
                                                ingredients = ingredients.toMutableList().apply { removeAt(index) }
                                            },
                                            modifier = Modifier.size(32.dp),
                                        ) {
                                            Icon(Icons.Default.Close, "Remove", tint = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                    OutlinedTextField(
                                        value = ingredient.name,
                                        onValueChange = { newName ->
                                            ingredients = ingredients.toMutableList().apply {
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
                                                ingredients = ingredients.toMutableList().apply {
                                                    set(index, ingredient.copy(dosage = newDosage))
                                                }
                                            },
                                            label = { Text("Dosage") },
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            modifier = Modifier.weight(1f),
                                            singleLine = true,
                                        )
                                        OutlinedTextField(
                                            value = ingredient.dosageUnit,
                                            onValueChange = { newUnit ->
                                                ingredients = ingredients.toMutableList().apply {
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
