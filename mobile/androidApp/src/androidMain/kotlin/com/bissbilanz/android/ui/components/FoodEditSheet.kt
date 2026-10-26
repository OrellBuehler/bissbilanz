package com.bissbilanz.android.ui.components

import android.util.Log
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.nutrientCategories
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.util.NAMED_NUTRIENT_KEYS
import com.bissbilanz.android.util.extraNutrientValues
import com.bissbilanz.android.util.toEditableString
import com.bissbilanz.label.ParsedNutrition
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.util.MAX_LABELS_PER_FOOD
import com.bissbilanz.util.normalizeLabel
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
    // Saveable form state below survives rotation and process death; the food is
    // only fetched once, so a restored draft is not overwritten by the stored row.
    var loaded by rememberSaveable { mutableStateOf(foodId == null) }
    var isLoading by remember { mutableStateOf(!loaded) }
    var isSaving by remember { mutableStateOf(false) }
    var isPhotoUploading by remember { mutableStateOf(false) }
    // Leaving mid-save or mid-upload would cancel it with this sheet's scope.
    val isBusy by rememberUpdatedState(isSaving || isPhotoUploading)
    val sheetState =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { it != SheetValue.Hidden || !isBusy },
        )
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    // The food itself saved but its image didn't: the sheet stays open with the photo
    // error, so leaving it still has to report the save the caller's list must reflect.
    var bodySaved by rememberSaveable { mutableStateOf(false) }
    val isEditing = foodId != null

    // Form state
    var name by rememberSaveable { mutableStateOf("") }
    var brand by rememberSaveable { mutableStateOf("") }
    var servingSize by rememberSaveable { mutableStateOf("100") }
    var servingUnit by rememberSaveable { mutableStateOf(ServingUnit.g) }
    var calories by rememberSaveable { mutableStateOf("") }
    var protein by rememberSaveable { mutableStateOf("") }
    var carbs by rememberSaveable { mutableStateOf("") }
    var fat by rememberSaveable { mutableStateOf("") }
    var fiber by rememberSaveable { mutableStateOf("") }
    var barcode by rememberSaveable { mutableStateOf(initialBarcode ?: "") }
    var showBarcodeScanner by remember { mutableStateOf(false) }
    var isFavorite by rememberSaveable { mutableStateOf(false) }
    var imageUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var originalImageUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var labels by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var originalLabels by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var labelInput by rememberSaveable { mutableStateOf("") }

    // Extended nutrients
    var saturatedFat by rememberSaveable { mutableStateOf("") }
    var sugar by rememberSaveable { mutableStateOf("") }
    var sodium by rememberSaveable { mutableStateOf("") }
    var salt by rememberSaveable { mutableStateOf("") }
    var potassium by rememberSaveable { mutableStateOf("") }
    var calcium by rememberSaveable { mutableStateOf("") }
    var iron by rememberSaveable { mutableStateOf("") }
    var vitaminC by rememberSaveable { mutableStateOf("") }
    var vitaminD by rememberSaveable { mutableStateOf("") }

    // Whether the typed macros describe 100 g/ml (packaging labels) or one serving
    // (what the record stores). Per-100 input is scaled on save, so the user never
    // does the arithmetic — same toggle and same maths as the iOS sheet.
    var perHundredBasis by rememberSaveable { mutableStateOf(false) }

    var showAdvanced by rememberSaveable { mutableStateOf(false) }
    // Open-ended rather than a fixed field list: any nutrient the API model
    // declares can be recorded, matching the iOS add-nutrient catalog.
    var extraNutrients by rememberSaveable { mutableStateOf<Map<String, String>>(emptyMap()) }
    var showNutrientPicker by remember { mutableStateOf(false) }
    var showLabelScanner by remember { mutableStateOf(false) }

    val loadFailedMessage = stringResource(R.string.food_form_load_failed)
    val foodDeletedMessage = stringResource(R.string.food_form_deleted)
    val context = LocalContext.current
    val nameRequiredMessage = stringResource(R.string.food_form_name_required_error)
    val requiredFieldsMessage = stringResource(R.string.food_form_required_fields_error)
    val invalidValuesMessage = stringResource(R.string.food_form_invalid_values_error)
    val saveFailedMessage = stringResource(R.string.food_form_save_failed)
    val imageSaveFailedMessage = stringResource(R.string.food_image_save_failed)

    fun close() {
        if (bodySaved) onSaved() else onDismiss()
    }

    LaunchedEffect(foodId) {
        if (foodId != null && !loaded) {
            try {
                val food = foodRepo.getFood(foodId)
                name = food.name
                brand = food.brand ?: ""
                servingSize = food.servingSize.toEditableString()
                servingUnit = ServingUnit.entries.first { it.value == food.servingUnit.value }
                calories = food.calories.toEditableString()
                protein = food.protein.toEditableString()
                carbs = food.carbs.toEditableString()
                fat = food.fat.toEditableString()
                fiber = food.fiber.toEditableString()
                barcode = food.barcode ?: ""
                isFavorite = food.isFavorite
                imageUrl = food.imageUrl
                originalImageUrl = food.imageUrl
                labels = food.labels ?: emptyList()
                originalLabels = labels
                saturatedFat = food.saturatedFat?.toEditableString() ?: ""
                sugar = food.sugar?.toEditableString() ?: ""
                sodium = food.sodium?.toEditableString() ?: ""
                salt = food.salt?.toEditableString() ?: ""
                potassium = food.potassium?.toEditableString() ?: ""
                calcium = food.calcium?.toEditableString() ?: ""
                iron = food.iron?.toEditableString() ?: ""
                vitaminC = food.vitaminC?.toEditableString() ?: ""
                vitaminD = food.vitaminD?.toEditableString() ?: ""
                extraNutrients = food.extraNutrientValues(json)
                loaded = true
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
        val optionalVals =
            listOf(saturatedFat, sugar, sodium, salt, potassium, calcium, iron, vitaminC, vitaminD) + extraNutrients.values
        val nutrientVals =
            listOf(caloriesVal, proteinVal, carbsVal, fatVal, fiberVal) + optionalVals.mapNotNull { it.toLocalizedDoubleOrNull() }
        if (servingSizeVal <= 0 || nutrientVals.any { it < 0 }) {
            errorMessage = invalidValuesMessage
            return
        }

        // A draft restored after process death can outlive its food (deleted on
        // another screen or device meanwhile); saving would recreate nothing useful.
        if (foodId != null && foodRepo.getFoodCached(foodId) == null) {
            Toast.makeText(context, foodDeletedMessage, Toast.LENGTH_LONG).show()
            close()
            return
        }

        // Per-100 input is normalized to the serving in grams/millilitres first (33 cl
        // is 330 ml), then scaled by servingInBase/100. Per-serving input keeps factor 1.
        val servingInBase = servingSizeVal * servingUnit.baseUnitsPerUnit()
        val factor = if (perHundredBasis && servingInBase > 0) servingInBase / 100 else 1.0

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
                        calories = caloriesVal * factor,
                        protein = proteinVal * factor,
                        carbs = carbsVal * factor,
                        fat = fatVal * factor,
                        fiber = fiberVal * factor,
                        barcode = barcode.trim().ifBlank { null },
                        isFavorite = isFavorite,
                        saturatedFat = saturatedFat.toLocalizedDoubleOrNull()?.times(factor),
                        sugar = sugar.toLocalizedDoubleOrNull()?.times(factor),
                        sodium = sodium.toLocalizedDoubleOrNull()?.times(factor),
                        salt = salt.toLocalizedDoubleOrNull()?.times(factor),
                        potassium = potassium.toLocalizedDoubleOrNull()?.times(factor),
                        calcium = calcium.toLocalizedDoubleOrNull()?.times(factor),
                        iron = iron.toLocalizedDoubleOrNull()?.times(factor),
                        vitaminC = vitaminC.toLocalizedDoubleOrNull()?.times(factor),
                        vitaminD = vitaminD.toLocalizedDoubleOrNull()?.times(factor),
                    )
                val withExtras =
                    foodCreate.withNutrients(
                        extraNutrients.mapValues { (_, raw) -> raw.toLocalizedDoubleOrNull()?.times(factor) },
                        json,
                    )
                if (isEditing) {
                    val id = foodId ?: return@launch
                    foodRepo.updateFood(id, withExtras)
                    bodySaved = true
                    // Separate from the body: `imageUrl` defaults to null on
                    // FoodCreate and the client omits defaults, so a removal sent
                    // that way would be dropped and the old image would stay.
                    if (imageUrl != originalImageUrl) {
                        try {
                            foodRepo.setImage(id, imageUrl)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            // The food is already saved, so this is the photo's failure
                            // alone; saying "couldn't save the food" would be a lie.
                            Log.e("FoodEditSheet", "Failed to save food image", e)
                            errorReporter.captureException(e)
                            errorMessage = imageSaveFailedMessage
                            isSaving = false
                            return@launch
                        }
                    }
                    // Labels live in their own table; only an actual edit is sent,
                    // because a user write replaces whatever a labeller seeded.
                    if (labels != originalLabels) foodRepo.setLabels(id, labels)
                } else {
                    // No id yet, so the already-uploaded URL rides along on the
                    // create body — `foodCreateSchema` accepts it.
                    val created = foodRepo.createFood(withExtras.copy(imageUrl = imageUrl))
                    if (labels.isNotEmpty()) foodRepo.setLabels(created.id, labels)
                }
                isSaving = false
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
        // Parsed values are per 100 g or 100 ml (the parser's canonical basis);
        // the user adjusts the serving and confirms before saving.
        servingSize = "100"
        servingUnit = if (parsed.isVolume) ServingUnit.ml else ServingUnit.g
        perHundredBasis = true
        parsed.calories?.let { calories = it.toEditableString() }
        parsed.protein?.let { protein = it.toEditableString() }
        parsed.carbs?.let { carbs = it.toEditableString() }
        parsed.fat?.let { fat = it.toEditableString() }
        parsed.fiber?.let { fiber = it.toEditableString() }
        var hasAdvanced = false
        parsed.sugar?.let {
            sugar = it.toEditableString()
            hasAdvanced = true
        }
        parsed.saturatedFat?.let {
            saturatedFat = it.toEditableString()
            hasAdvanced = true
        }
        parsed.sodium?.let {
            sodium = it.toEditableString()
            hasAdvanced = true
        }
        parsed.salt?.let {
            salt = it.toEditableString()
            hasAdvanced = true
        }
        if (hasAdvanced) showAdvanced = true
    }

    ModalBottomSheet(
        onDismissRequest = { close() },
        sheetState = sheetState,
        // confirmValueChange covers swipe and scrim; Back goes straight to the dialog.
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !isBusy),
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
                        .padding(horizontal = Dimens.SheetHorizontalPadding)
                        .padding(bottom = Dimens.SheetBottomPadding)
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
                    onUploadingChange = { isPhotoUploading = it },
                )

                if (!isEditing) {
                    OutlinedButton(
                        onClick = { showLabelScanner = true },
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = ButtonDefaults.ButtonWithIconContentPadding,
                    ) {
                        Icon(Icons.Default.DocumentScanner, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                        Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                        Text(stringResource(R.string.scan_label))
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
                    ChoiceDropdown(
                        selectedLabel = servingUnit.name.lowercase(),
                        options = ServingUnit.entries.map { it.name.lowercase() to it },
                        onSelect = { servingUnit = it },
                        label = stringResource(R.string.food_form_unit),
                        modifier = Modifier.weight(1f),
                    )
                }
                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text(stringResource(R.string.food_form_barcode)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    trailingIcon = {
                        IconButton(onClick = { showBarcodeScanner = true }) {
                            Icon(Icons.Default.QrCodeScanner, stringResource(R.string.scan_barcode_title))
                        }
                    },
                )
                if (showBarcodeScanner) {
                    BarcodeCaptureDialog(
                        onDismiss = { showBarcodeScanner = false },
                        onScanned = { barcode = it },
                    )
                }
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
                Text(stringResource(R.string.food_form_values_per), style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val basisOptions =
                        listOf(
                            stringResource(R.string.food_form_per_serving) to false,
                            stringResource(
                                if (servingUnit.isVolume()) {
                                    R.string.food_form_per_100_ml
                                } else {
                                    R.string.food_form_per_100_g
                                },
                            ) to true,
                        )
                    basisOptions.forEachIndexed { index, (label, value) ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index, basisOptions.size),
                            onClick = { perHundredBasis = value },
                            selected = perHundredBasis == value,
                        ) {
                            Text(label)
                        }
                    }
                }
                Text(
                    stringResource(R.string.food_form_macro_basis_footer),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                            TextButton(
                                onClick = { showNutrientPicker = true },
                                contentPadding = ButtonDefaults.TextButtonWithIconContentPadding,
                            ) {
                                Icon(Icons.Default.Add, null, modifier = Modifier.size(ButtonDefaults.IconSize))
                                Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
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

                SheetActionRow {
                    OutlinedButton(
                        onClick = {
                            scope.launch { sheetState.hide() }.invokeOnCompletion { close() }
                        },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        enabled = !isBusy,
                    ) {
                        Text(stringResource(R.string.dialog_cancel), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Button(
                        onClick = { save() },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        enabled =
                            !isBusy &&
                                name.isNotBlank() &&
                                calories.toLocalizedDoubleOrNull() != null &&
                                protein.toLocalizedDoubleOrNull() != null &&
                                carbs.toLocalizedDoubleOrNull() != null &&
                                fat.toLocalizedDoubleOrNull() != null &&
                                servingSize.toLocalizedDoubleOrNull() != null,
                    ) {
                        Text(stringResource(R.string.action_save), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

/**
 * Grams (mass) or millilitres (volume) in one unit, so a serving can be normalized to
 * the 100 g/ml basis packaging labels use. Mirrors `ServingUnit.baseUnitsPerUnit` on iOS.
 */
private fun ServingUnit.baseUnitsPerUnit(): Double =
    when (this) {
        ServingUnit.g, ServingUnit.ml -> 1.0
        ServingUnit.kg, ServingUnit.l -> 1000.0
        ServingUnit.cl -> 10.0
        ServingUnit.oz -> 28.35
        ServingUnit.lb -> 453.59
        ServingUnit.fl_oz -> 29.57
        ServingUnit.cup -> 240.0
        ServingUnit.tbsp -> 15.0
        ServingUnit.tsp -> 5.0
    }

/** Volume units label the per-100 basis as 100 ml instead of 100 g. */
private fun ServingUnit.isVolume(): Boolean =
    when (this) {
        ServingUnit.ml, ServingUnit.cl, ServingUnit.l, ServingUnit.fl_oz,
        ServingUnit.cup, ServingUnit.tbsp, ServingUnit.tsp,
        -> true

        ServingUnit.g, ServingUnit.kg, ServingUnit.oz, ServingUnit.lb -> false
    }
