package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.nutrientCategories
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.util.NAMED_NUTRIENT_KEYS
import com.bissbilanz.android.util.extraNutrientValues
import com.bissbilanz.label.ParsedNutrition
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.util.MAX_LABELS_PER_FOOD
import com.bissbilanz.util.formatNutrient
import com.bissbilanz.util.normalizeLabel
import com.bissbilanz.util.toDisplayString
import com.bissbilanz.util.toLocalizedDoubleOrNull
import com.bissbilanz.util.withNutrients
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodEditSheet(
    foodId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    initialBarcode: String? = null,
) {
    val foodRepo: FoodRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val json: Json = koinInject()
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
    var servingUnit by remember { mutableStateOf(ServingUnit.g) }
    var calories by remember { mutableStateOf("") }
    var protein by remember { mutableStateOf("") }
    var carbs by remember { mutableStateOf("") }
    var fat by remember { mutableStateOf("") }
    var fiber by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf(initialBarcode ?: "") }
    var isFavorite by remember { mutableStateOf(false) }
    var imageUrl by remember { mutableStateOf<String?>(null) }
    var originalImageUrl by remember { mutableStateOf<String?>(null) }
    var labels by remember { mutableStateOf<List<String>>(emptyList()) }
    var originalLabels by remember { mutableStateOf<List<String>>(emptyList()) }
    var labelInput by remember { mutableStateOf("") }

    // Extended nutrients
    var saturatedFat by remember { mutableStateOf("") }
    var sugar by remember { mutableStateOf("") }
    var sodium by remember { mutableStateOf("") }
    var salt by remember { mutableStateOf("") }
    var potassium by remember { mutableStateOf("") }
    var calcium by remember { mutableStateOf("") }
    var iron by remember { mutableStateOf("") }
    var vitaminC by remember { mutableStateOf("") }
    var vitaminD by remember { mutableStateOf("") }

    var showAdvanced by remember { mutableStateOf(false) }
    // Open-ended rather than a fixed field list: any nutrient the API model
    // declares can be recorded, matching the iOS add-nutrient catalog.
    var extraNutrients by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var showNutrientPicker by remember { mutableStateOf(false) }
    var showUnitDropdown by remember { mutableStateOf(false) }
    var showLabelScanner by remember { mutableStateOf(false) }

    val loadFailedMessage = stringResource(R.string.food_form_load_failed)
    val nameRequiredMessage = stringResource(R.string.food_form_name_required_error)
    val requiredFieldsMessage = stringResource(R.string.food_form_required_fields_error)
    val saveFailedMessage = stringResource(R.string.food_form_save_failed)

    LaunchedEffect(foodId) {
        if (foodId != null) {
            try {
                val food = foodRepo.getFood(foodId)
                name = food.name
                brand = food.brand ?: ""
                servingSize = food.servingSize.toDisplayString()
                servingUnit = ServingUnit.entries.first { it.value == food.servingUnit.value }
                calories = food.calories.formatNutrient()
                protein = food.protein.formatNutrient()
                carbs = food.carbs.formatNutrient()
                fat = food.fat.formatNutrient()
                fiber = food.fiber.formatNutrient()
                barcode = food.barcode ?: ""
                isFavorite = food.isFavorite
                imageUrl = food.imageUrl
                originalImageUrl = food.imageUrl
                labels = food.labels ?: emptyList()
                originalLabels = labels
                saturatedFat = food.saturatedFat?.formatNutrient() ?: ""
                sugar = food.sugar?.formatNutrient() ?: ""
                sodium = food.sodium?.formatNutrient() ?: ""
                salt = food.salt?.formatNutrient() ?: ""
                potassium = food.potassium?.formatNutrient() ?: ""
                calcium = food.calcium?.formatNutrient() ?: ""
                iron = food.iron?.formatNutrient() ?: ""
                vitaminC = food.vitaminC?.formatNutrient() ?: ""
                vitaminD = food.vitaminD?.formatNutrient() ?: ""
                extraNutrients = food.extraNutrientValues(json)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e("FoodEditSheet", "Failed to load food", e)
                errorReporter.captureException(e)
                errorMessage = loadFailedMessage
            }
            isLoading = false
        }
    }

    fun save() {
        val nameVal = name.trim()
        if (nameVal.isBlank()) {
            errorMessage = nameRequiredMessage
            return
        }
        val caloriesVal = calories.toLocalizedDoubleOrNull()
        val proteinVal = protein.toLocalizedDoubleOrNull()
        val carbsVal = carbs.toLocalizedDoubleOrNull()
        val fatVal = fat.toLocalizedDoubleOrNull()
        val servingSizeVal = servingSize.toLocalizedDoubleOrNull()
        if (caloriesVal == null || proteinVal == null || carbsVal == null || fatVal == null || servingSizeVal == null) {
            errorMessage = requiredFieldsMessage
            return
        }
        val fiberVal = fiber.toLocalizedDoubleOrNull() ?: 0.0

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
                        saturatedFat = saturatedFat.toLocalizedDoubleOrNull(),
                        sugar = sugar.toLocalizedDoubleOrNull(),
                        sodium = sodium.toLocalizedDoubleOrNull(),
                        salt = salt.toLocalizedDoubleOrNull(),
                        potassium = potassium.toLocalizedDoubleOrNull(),
                        calcium = calcium.toLocalizedDoubleOrNull(),
                        iron = iron.toLocalizedDoubleOrNull(),
                        vitaminC = vitaminC.toLocalizedDoubleOrNull(),
                        vitaminD = vitaminD.toLocalizedDoubleOrNull(),
                    )
                val withExtras =
                    foodCreate.withNutrients(
                        extraNutrients.mapValues { (_, raw) -> raw.toLocalizedDoubleOrNull() },
                        json,
                    )
                if (isEditing) {
                    val id = foodId ?: return@launch
                    foodRepo.updateFood(id, withExtras)
                    // Separate from the body: `imageUrl` defaults to null on
                    // FoodCreate and the client omits defaults, so a removal sent
                    // that way would be dropped and the old image would stay.
                    if (imageUrl != originalImageUrl) foodRepo.setImage(id, imageUrl)
                    // Labels live in their own table; only an actual edit is sent,
                    // because a user write replaces whatever a labeller seeded.
                    if (labels != originalLabels) foodRepo.setLabels(id, labels)
                } else {
                    // No id yet, so the already-uploaded URL rides along on the
                    // create body — `foodCreateSchema` accepts it.
                    val created = foodRepo.createFood(withExtras.copy(imageUrl = imageUrl))
                    if (labels.isNotEmpty()) foodRepo.setLabels(created.id, labels)
                }
                sheetState.hide()
                onSaved()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e("FoodEditSheet", "Failed to save food", e)
                errorReporter.captureException(e)
                errorMessage = saveFailedMessage
            }
            isSaving = false
        }
    }

    fun applyParsed(parsed: ParsedNutrition) {
        // Parsed values are per 100 g (the parser's canonical basis); the user
        // adjusts the serving and confirms before saving.
        servingSize = "100"
        servingUnit = ServingUnit.g
        parsed.calories?.let { calories = it.formatNutrient() }
        parsed.protein?.let { protein = it.formatNutrient() }
        parsed.carbs?.let { carbs = it.formatNutrient() }
        parsed.fat?.let { fat = it.formatNutrient() }
        parsed.fiber?.let { fiber = it.formatNutrient() }
        var hasAdvanced = false
        parsed.sugar?.let {
            sugar = it.formatNutrient()
            hasAdvanced = true
        }
        parsed.saturatedFat?.let {
            saturatedFat = it.formatNutrient()
            hasAdvanced = true
        }
        parsed.sodium?.let {
            sodium = it.formatNutrient()
            hasAdvanced = true
        }
        parsed.salt?.let {
            salt = it.formatNutrient()
            hasAdvanced = true
        }
        if (hasAdvanced) showAdvanced = true
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
                    if (isEditing) stringResource(R.string.food_edit_title) else stringResource(R.string.food_create_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                FoodImageField(
                    imageUrl = imageUrl,
                    onImageUrlChange = { imageUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                )

                if (!isEditing) {
                    OutlinedButton(
                        onClick = { showLabelScanner = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.DocumentScanner, contentDescription = null)
                        Text(
                            stringResource(R.string.scan_label),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    Text(
                        stringResource(R.string.scan_label_footer),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (showLabelScanner) {
                    NutritionLabelScanDialog(
                        onDismiss = { showLabelScanner = false },
                        onParsed = {
                            applyParsed(it)
                            showLabelScanner = false
                        },
                    )
                }

                // Basic info
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.food_form_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = brand,
                    onValueChange = { brand = it },
                    label = { Text(stringResource(R.string.food_form_brand)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = servingSize,
                        onValueChange = { servingSize = it },
                        label = { Text(stringResource(R.string.food_form_serving_size)) },
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
                            label = { Text(stringResource(R.string.food_form_unit)) },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = showUnitDropdown)
                            },
                            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
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
                    label = { Text(stringResource(R.string.food_form_barcode)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                FoodLabelsInput(
                    labels = labels,
                    input = labelInput,
                    onInputChange = { labelInput = it },
                    onAdd = {
                        val value = normalizeLabel(labelInput)
                        if (value != null && value !in labels && labels.size < MAX_LABELS_PER_FOOD) {
                            labels = labels + value
                        }
                        labelInput = ""
                    },
                    onRemove = { label -> labels = labels - label },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.action_favorite))
                    Switch(checked = isFavorite, onCheckedChange = { isFavorite = it })
                }

                HorizontalDivider()

                // Macros
                Text(
                    stringResource(R.string.food_form_macros),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                NutrientTextField(stringResource(R.string.food_form_calories_required), calories, CaloriesBlue) { calories = it }
                NutrientTextField(stringResource(R.string.food_form_protein_required), protein, ProteinRed) { protein = it }
                NutrientTextField(stringResource(R.string.food_form_carbs_required), carbs, CarbsOrange) { carbs = it }
                NutrientTextField(stringResource(R.string.food_form_fat_required), fat, FatYellow) { fat = it }
                NutrientTextField(stringResource(R.string.food_form_fiber_optional), fiber, FiberGreen) { fiber = it }

                // Advanced
                TextButton(
                    onClick = { showAdvanced = !showAdvanced },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(if (showAdvanced) R.string.food_form_hide_advanced else R.string.food_form_show_advanced))
                }
                AnimatedVisibility(visible = showAdvanced) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            stringResource(R.string.nutrient_category_fat_breakdown),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        NutrientTextField(stringResource(R.string.food_form_nutrient_saturated_fat), saturatedFat) { saturatedFat = it }

                        Text(
                            stringResource(R.string.nutrient_category_sugar_carb),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        NutrientTextField(stringResource(R.string.food_form_nutrient_sugar), sugar) { sugar = it }

                        Text(
                            stringResource(R.string.nutrient_category_mineral),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        NutrientTextField(stringResource(R.string.food_form_nutrient_sodium), sodium) { sodium = it }
                        NutrientTextField(stringResource(R.string.food_form_nutrient_salt), salt) { salt = it }
                        NutrientTextField(stringResource(R.string.food_form_nutrient_potassium), potassium) { potassium = it }
                        NutrientTextField(stringResource(R.string.food_form_nutrient_calcium), calcium) { calcium = it }
                        NutrientTextField(stringResource(R.string.food_form_nutrient_iron), iron) { iron = it }

                        Text(
                            stringResource(R.string.nutrient_category_vitamin),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        NutrientTextField(stringResource(R.string.food_form_nutrient_vitamin_c), vitaminC) { vitaminC = it }
                        NutrientTextField(stringResource(R.string.food_form_nutrient_vitamin_d), vitaminD) { vitaminD = it }

                        // Anything beyond the fields above, added on demand.
                        val catalog = nutrientCategories()
                        val labels =
                            remember(catalog) {
                                catalog.flatMap { (_, entries) -> entries }.toMap()
                            }

                        if (extraNutrients.isNotEmpty()) {
                            Text(
                                stringResource(R.string.food_form_additional_nutrients),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            extraNutrients.keys.sorted().forEach { key ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        NutrientTextField(labels[key] ?: key, extraNutrients[key] ?: "") { value ->
                                            extraNutrients = extraNutrients + (key to value)
                                        }
                                    }
                                    IconButton(onClick = { extraNutrients = extraNutrients - key }) {
                                        Icon(
                                            Icons.Default.Close,
                                            stringResource(R.string.food_form_remove_nutrient),
                                        )
                                    }
                                }
                            }
                        }

                        Box {
                            TextButton(onClick = { showNutrientPicker = true }) {
                                Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(stringResource(R.string.food_form_add_nutrient))
                            }
                            DropdownMenu(
                                expanded = showNutrientPicker,
                                onDismissRequest = { showNutrientPicker = false },
                            ) {
                                catalog.forEach { (category, entries) ->
                                    val available =
                                        entries.filter { (key, _) ->
                                            key !in NAMED_NUTRIENT_KEYS && key !in extraNutrients
                                        }
                                    if (available.isEmpty()) return@forEach
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                category,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        },
                                        onClick = {},
                                        enabled = false,
                                    )
                                    available.forEach { (key, label) ->
                                        DropdownMenuItem(
                                            text = { Text(label) },
                                            onClick = {
                                                extraNutrients = extraNutrients + (key to "")
                                                showNutrientPicker = false
                                            },
                                        )
                                    }
                                }
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
                        Text(stringResource(R.string.dialog_cancel))
                    }
                    Button(
                        onClick = { save() },
                        modifier = Modifier.weight(1f),
                        enabled =
                            !isSaving &&
                                name.isNotBlank() &&
                                calories.toLocalizedDoubleOrNull() != null &&
                                protein.toLocalizedDoubleOrNull() != null &&
                                carbs.toLocalizedDoubleOrNull() != null &&
                                fat.toLocalizedDoubleOrNull() != null &&
                                servingSize.toLocalizedDoubleOrNull() != null,
                    ) {
                        Text(stringResource(R.string.weight_save))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
