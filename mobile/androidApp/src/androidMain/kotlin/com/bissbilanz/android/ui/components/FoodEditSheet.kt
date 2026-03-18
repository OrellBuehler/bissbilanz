package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.util.toDisplayString
import io.sentry.Sentry
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodEditSheet(
    foodId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val foodRepo: FoodRepository = koinInject()
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isLoading by remember { mutableStateOf(foodId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val isEditing = foodId != null

    // Form state
    var name by remember { mutableStateOf("") }
    var brand by remember { mutableStateOf("") }
    var servingSize by remember { mutableStateOf("100") }
    var servingUnit by remember { mutableStateOf(ServingUnit.G) }
    var calories by remember { mutableStateOf("") }
    var protein by remember { mutableStateOf("") }
    var carbs by remember { mutableStateOf("") }
    var fat by remember { mutableStateOf("") }
    var fiber by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }
    var isFavorite by remember { mutableStateOf(false) }

    // Extended nutrients
    var saturatedFat by remember { mutableStateOf("") }
    var sugar by remember { mutableStateOf("") }
    var sodium by remember { mutableStateOf("") }
    var potassium by remember { mutableStateOf("") }
    var calcium by remember { mutableStateOf("") }
    var iron by remember { mutableStateOf("") }
    var vitaminC by remember { mutableStateOf("") }
    var vitaminD by remember { mutableStateOf("") }

    var showAdvanced by remember { mutableStateOf(false) }
    var showUnitDropdown by remember { mutableStateOf(false) }

    LaunchedEffect(foodId) {
        if (foodId != null) {
            try {
                val food = foodRepo.getFood(foodId)
                name = food.name
                brand = food.brand ?: ""
                servingSize = food.servingSize.toDisplayString()
                servingUnit = food.servingUnit
                calories = food.calories.toDisplayString()
                protein = food.protein.toDisplayString()
                carbs = food.carbs.toDisplayString()
                fat = food.fat.toDisplayString()
                fiber = food.fiber.toDisplayString()
                barcode = food.barcode ?: ""
                isFavorite = food.isFavorite
                saturatedFat = food.saturatedFat?.toString() ?: ""
                sugar = food.sugar?.toString() ?: ""
                sodium = food.sodium?.toString() ?: ""
                potassium = food.potassium?.toString() ?: ""
                calcium = food.calcium?.toString() ?: ""
                iron = food.iron?.toString() ?: ""
                vitaminC = food.vitaminC?.toString() ?: ""
                vitaminD = food.vitaminD?.toString() ?: ""
            } catch (e: Exception) {
                Log.e("FoodEditSheet", "Failed to load food", e)
                Sentry.captureException(e)
                errorMessage = "Failed to load food"
            }
            isLoading = false
        }
    }

    fun save() {
        val nameVal = name.trim()
        if (nameVal.isBlank()) {
            errorMessage = "Name is required"
            return
        }
        val caloriesVal = calories.toDoubleOrNull()
        val proteinVal = protein.toDoubleOrNull()
        val carbsVal = carbs.toDoubleOrNull()
        val fatVal = fat.toDoubleOrNull()
        val servingSizeVal = servingSize.toDoubleOrNull()
        if (caloriesVal == null || proteinVal == null || carbsVal == null || fatVal == null || servingSizeVal == null) {
            errorMessage = "Calories, protein, carbs, fat, and serving size are required"
            return
        }
        val fiberVal = fiber.toDoubleOrNull() ?: 0.0

        errorMessage = null
        isSaving = true
        scope.launch {
            try {
                val foodCreate =
                    FoodCreate(
                        name = nameVal,
                        brand = brand.trim().ifBlank { null },
                        servingSize = servingSizeVal,
                        servingUnit = servingUnit,
                        calories = caloriesVal,
                        protein = proteinVal,
                        carbs = carbsVal,
                        fat = fatVal,
                        fiber = fiberVal,
                        barcode = barcode.trim().ifBlank { null },
                        isFavorite = isFavorite,
                        saturatedFat = saturatedFat.toDoubleOrNull(),
                        sugar = sugar.toDoubleOrNull(),
                        sodium = sodium.toDoubleOrNull(),
                        potassium = potassium.toDoubleOrNull(),
                        calcium = calcium.toDoubleOrNull(),
                        iron = iron.toDoubleOrNull(),
                        vitaminC = vitaminC.toDoubleOrNull(),
                        vitaminD = vitaminD.toDoubleOrNull(),
                    )
                if (isEditing) {
                    val id = foodId ?: return@launch
                    foodRepo.updateFood(id, foodCreate)
                } else {
                    foodRepo.createFood(foodCreate)
                }
                sheetState.hide()
                onSaved()
            } catch (e: Exception) {
                Log.e("FoodEditSheet", "Failed to save food", e)
                Sentry.captureException(e)
                errorMessage = "Failed to save food"
            }
            isSaving = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxWidth().padding(48.dp),
                contentAlignment = androidx.compose.ui.Alignment.Center,
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
                    if (isEditing) "Edit Food" else "Create Food",
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
                OutlinedTextField(
                    value = brand,
                    onValueChange = { brand = it },
                    label = { Text("Brand") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = servingSize,
                        onValueChange = { servingSize = it },
                        label = { Text("Serving size") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    ExposedDropdownMenuBox(
                        expanded = showUnitDropdown,
                        onExpandedChange = { showUnitDropdown = it },
                        modifier = Modifier.weight(1f),
                    ) {
                        OutlinedTextField(
                            value = servingUnit.name.lowercase(),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Unit") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = showUnitDropdown)
                            },
                            modifier = Modifier.menuAnchor(),
                            singleLine = true,
                        )
                        ExposedDropdownMenu(
                            expanded = showUnitDropdown,
                            onDismissRequest = { showUnitDropdown = false },
                        ) {
                            ServingUnit.entries.forEach { unit ->
                                DropdownMenuItem(
                                    text = { Text(unit.name.lowercase()) },
                                    onClick = {
                                        servingUnit = unit
                                        showUnitDropdown = false
                                    },
                                )
                            }
                        }
                    }
                }
                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text("Barcode") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Favorite")
                    Switch(checked = isFavorite, onCheckedChange = { isFavorite = it })
                }

                HorizontalDivider()

                // Macros
                Text(
                    "Macros",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                NutrientTextField("Calories (kcal) *", calories, CaloriesBlue) { calories = it }
                NutrientTextField("Protein (g) *", protein, ProteinRed) { protein = it }
                NutrientTextField("Carbs (g) *", carbs, CarbsOrange) { carbs = it }
                NutrientTextField("Fat (g) *", fat, FatYellow) { fat = it }
                NutrientTextField("Fiber (g)", fiber, FiberGreen) { fiber = it }

                // Advanced
                TextButton(
                    onClick = { showAdvanced = !showAdvanced },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (showAdvanced) "Hide advanced nutrients" else "Show advanced nutrients")
                }
                AnimatedVisibility(visible = showAdvanced) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Fat Breakdown", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                        NutrientTextField("Saturated Fat (g)", saturatedFat) { saturatedFat = it }

                        Text("Sugar & Carbs", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                        NutrientTextField("Sugar (g)", sugar) { sugar = it }

                        Text("Minerals", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                        NutrientTextField("Sodium (mg)", sodium) { sodium = it }
                        NutrientTextField("Potassium (mg)", potassium) { potassium = it }
                        NutrientTextField("Calcium (mg)", calcium) { calcium = it }
                        NutrientTextField("Iron (mg)", iron) { iron = it }

                        Text("Vitamins", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                        NutrientTextField("Vitamin C (mg)", vitaminC) { vitaminC = it }
                        NutrientTextField("Vitamin D (mcg)", vitaminD) { vitaminD = it }
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
                        onClick = { save() },
                        modifier = Modifier.weight(1f),
                        enabled =
                            !isSaving &&
                                name.isNotBlank() &&
                                calories.toDoubleOrNull() != null &&
                                protein.toDoubleOrNull() != null &&
                                carbs.toDoubleOrNull() != null &&
                                fat.toDoubleOrNull() != null &&
                                servingSize.toDoubleOrNull() != null,
                    ) {
                        Text("Save")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
