package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.util.toEditableString
import com.bissbilanz.foodpackage.MAX_RECIPE_INGREDIENTS
import com.bissbilanz.model.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.MAX_LABELS_PER_FOOD
import com.bissbilanz.util.MAX_RECIPE_NAME
import com.bissbilanz.util.RecipeField
import com.bissbilanz.util.RecipeStepDraft
import com.bissbilanz.util.caloriesPerHundredGrams
import com.bissbilanz.util.isSameUnitDimension
import com.bissbilanz.util.newTempId
import com.bissbilanz.util.normalizeLabel
import com.bissbilanz.util.toLocalizedDoubleOrNull
import com.bissbilanz.util.toStepInputs
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.koin.compose.koinInject

// Saved with the form, so only what the row shows: a whole Food per row would bloat the
// saved state. [foodName] is null when the food could not be resolved; the row still saves.
@Serializable
private data class RecipeIngredientRow(
    val key: String = newTempId(),
    val foodId: String = "",
    val foodName: String? = null,
    /** The food's own unit, which limits the units offered. */
    val foodUnit: String? = null,
    val quantity: String = "100",
    val unit: ServingUnit = ServingUnit.g,
)

private fun ingredientRow(
    food: Food?,
    foodId: String,
    quantity: Double,
    unitValue: String,
) = RecipeIngredientRow(
    foodId = foodId,
    foodName = food?.name,
    foodUnit = food?.servingUnit?.value,
    quantity = quantity.toEditableString(),
    unit = ServingUnit.entries.first { it.value == unitValue },
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeEditSheet(
    recipeId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val recipeRepo: RecipeRepository = koinInject()
    val foodRepo: FoodRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    // Saveable form state below survives rotation and process death; the recipe is
    // only fetched once, so a restored draft is not overwritten by the stored row.
    var loaded by rememberSaveable { mutableStateOf(recipeId == null) }
    var isLoading by remember { mutableStateOf(!loaded) }
    var isSaving by remember { mutableStateOf(false) }
    var isCoverUploading by remember { mutableStateOf(false) }
    var uploadingStepKeys by remember { mutableStateOf(emptySet<String>()) }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    // The recipe itself saved but its image didn't: the sheet stays open with the photo
    // error, so leaving it still has to report the save the caller's list must reflect.
    var bodySaved by rememberSaveable { mutableStateOf(false) }
    // A new recipe once its create went through: saving again updates it instead of
    // creating a second one.
    var createdId by rememberSaveable { mutableStateOf<String?>(null) }
    val isEditing = recipeId != null

    var name by rememberSaveable { mutableStateOf("") }
    var totalServings by rememberSaveable { mutableStateOf("1") }
    var isFavorite by rememberSaveable { mutableStateOf(false) }
    var imageUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var originalImageUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var cookedWeightText by rememberSaveable { mutableStateOf("") }
    var loadedCalories by rememberSaveable { mutableStateOf<Double?>(null) }
    var labels by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var originalLabels by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var labelInput by rememberSaveable { mutableStateOf("") }

    var ingredients by rememberSaveable(stateSaver = rememberJsonValueSaver<List<RecipeIngredientRow>>()) {
        mutableStateOf(emptyList())
    }
    var steps by rememberSaveable(stateSaver = rememberJsonValueSaver<List<RecipeStepDraft>>()) {
        mutableStateOf(emptyList())
    }
    // False when the recipe came from a cache that never downloaded its steps (offline
    // after a list-only refresh): the editor is hidden and a save leaves them untouched
    // rather than sending an empty list that would clear them on the server.
    var stepsAvailable by rememberSaveable { mutableStateOf(true) }
    var openUnitDropdownKey by remember { mutableStateOf<String?>(null) }
    var showFoodPicker by rememberSaveable { mutableStateOf(false) }
    var showRecipeSource by rememberSaveable { mutableStateOf(false) }

    // A removed step's upload is cancelled with its field, so only live steps count.
    val isPhotoUploading = isCoverUploading || steps.any { it.key in uploadingStepKeys }
    // Leaving mid-save or mid-upload would cancel it with this sheet's scope.
    val isBusy by rememberUpdatedState(isSaving || isPhotoUploading)
    val sheetState =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { it != SheetValue.Hidden || !isBusy },
        )
    val ingredientQuantities = ingredients.map { it.quantity.toLocalizedDoubleOrNull() }
    val servingsValue = totalServings.toLocalizedDoubleOrNull()

    val loadFailedMessage = stringResource(R.string.recipe_edit_load_failed)
    val saveFailedMessage = stringResource(R.string.recipe_edit_save_failed)
    val imageSaveFailedMessage = stringResource(R.string.food_image_save_failed)

    fun close() {
        if (bodySaved) onSaved() else onDismiss()
    }

    // The server's recipe response has no embedded `food` on ingredients — resolve each
    // one through FoodRepository (cache first, then network) so the sheet shows real
    // names instead of a generic placeholder. An ingredient whose food can't be resolved
    // (e.g. deleted, or offline with nothing cached) is NEVER dropped — it still saves.
    suspend fun resolveFood(foodId: String): Food? =
        foodRepo.getFoodCached(foodId) ?: try {
            foodRepo.getFood(foodId)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            null
        }

    LaunchedEffect(recipeId) {
        if (recipeId != null && !loaded) {
            try {
                val recipe = recipeRepo.getRecipe(recipeId)
                name = recipe.name
                totalServings = recipe.totalServings.toEditableString()
                isFavorite = recipe.isFavorite
                imageUrl = recipe.imageUrl
                originalImageUrl = recipe.imageUrl
                cookedWeightText = recipe.cookedWeight?.toEditableString() ?: ""
                loadedCalories = recipe.calories
                labels = recipe.labels ?: emptyList()
                originalLabels = labels
                stepsAvailable = recipe.steps != null
                steps =
                    recipe.steps.orEmpty().sortedBy { it.sortOrder }.map {
                        RecipeStepDraft(key = newTempId(), text = it.text, imageUrl = it.imageUrl)
                    }
                ingredients =
                    recipe.ingredients.map { ing ->
                        ingredientRow(resolveFood(ing.foodId), ing.foodId, ing.quantity, ing.servingUnit.value)
                    }
                loaded = true
                errorMessage = null
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e("RecipeEditSheet", "Failed to load recipe", e)
                errorReporter.captureException(e)
                errorMessage = loadFailedMessage
            }
            isLoading = false
        }
    }

    if (showFoodPicker) {
        FoodPickerSheet(
            title = stringResource(R.string.recipe_edit_add_ingredient),
            onDismiss = { showFoodPicker = false },
            onFoodSelected = { food ->
                ingredients = ingredients + ingredientRow(food, food.id, food.servingSize, food.servingUnit.value)
                showFoodPicker = false
            },
        )
    }

    if (showRecipeSource) {
        RecipeSourceSheet(
            existingCount = ingredients.size,
            excludeRecipeId = recipeId,
            onDismiss = { showRecipeSource = false },
            onAdd = { scaled ->
                showRecipeSource = false
                scope.launch {
                    val rows =
                        scaled.map { ing ->
                            ingredientRow(resolveFood(ing.foodId), ing.foodId, ing.quantity, ing.servingUnit.value)
                        }
                    ingredients = ingredients + rows
                }
            },
        )
    }

    ModalBottomSheet(
        onDismissRequest = { if (!isBusy) close() },
        sheetState = sheetState,
        // Back bypasses confirmValueChange.
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !isBusy),
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
                    if (isEditing) stringResource(R.string.recipe_edit_edit_title) else stringResource(R.string.recipe_edit_create_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                FoodImageField(
                    imageUrl = imageUrl,
                    onImageUrlChange = { imageUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = stringResource(R.string.recipe_image_label),
                    onUploadingChange = { isCoverUploading = it },
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { if (it.length <= MAX_RECIPE_NAME) name = it },
                    label = { Text(stringResource(R.string.recipe_edit_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = totalServings,
                    onValueChange = { totalServings = it },
                    label = { Text(stringResource(R.string.recipe_edit_total_servings)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = servingsValue == null || servingsValue <= 0.0,
                )
                OutlinedTextField(
                    value = cookedWeightText,
                    onValueChange = { cookedWeightText = it },
                    label = { Text(stringResource(R.string.recipe_edit_cooked_weight)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    supportingText = {
                        val cookedWeightVal = cookedWeightText.toLocalizedDoubleOrNull()
                        val perHundredG =
                            loadedCalories?.let { cals ->
                                caloriesPerHundredGrams(
                                    cals,
                                    cookedWeightVal,
                                    servingsValue?.takeIf { it > 0.0 } ?: 1.0,
                                )
                            }
                        Text(
                            perHundredG?.let {
                                stringResource(R.string.recipe_edit_cooked_weight_per_100g, it.toInt())
                            } ?: stringResource(R.string.recipe_edit_cooked_weight_hint),
                        )
                    },
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
                    hint = stringResource(R.string.recipe_edit_labels_hint),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.action_favorite))
                    Switch(checked = isFavorite, onCheckedChange = { isFavorite = it })
                }

                HorizontalDivider()

                // Ingredients
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.recipe_edit_ingredients_count, ingredients.size),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    FilledTonalButton(
                        onClick = { showFoodPicker = true },
                        enabled = ingredients.size < MAX_RECIPE_INGREDIENTS,
                        contentPadding = ButtonDefaults.ButtonWithIconContentPadding,
                    ) {
                        Icon(Icons.Default.Add, null, modifier = Modifier.size(ButtonDefaults.IconSize))
                        Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                        Text(stringResource(R.string.action_add))
                    }
                }

                if (ingredients.size > MAX_RECIPE_INGREDIENTS) {
                    Text(
                        stringResource(R.string.recipe_edit_too_many_ingredients, MAX_RECIPE_INGREDIENTS),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                OutlinedButton(
                    onClick = { showRecipeSource = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = ingredients.size < MAX_RECIPE_INGREDIENTS,
                ) {
                    Text(stringResource(R.string.recipe_edit_add_from_recipe), maxLines = 1)
                }

                ingredients.forEachIndexed { index, ingredient ->
                    key(ingredient.key) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        ingredient.foodName ?: stringResource(R.string.food_detail_default_title),
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.weight(1f),
                                    )
                                    IconButton(
                                        onClick = {
                                            ingredients = ingredients.filter { it.key != ingredient.key }
                                        },
                                    ) {
                                        Icon(
                                            Icons.Default.Close,
                                            stringResource(R.string.recipe_edit_remove),
                                            tint = MaterialTheme.colorScheme.error,
                                        )
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = ingredient.quantity,
                                        onValueChange = { newQty ->
                                            ingredients =
                                                ingredients.map {
                                                    if (it.key == ingredient.key) it.copy(quantity = newQty) else it
                                                }
                                        },
                                        label = { Text(stringResource(R.string.recipe_edit_amount)) },
                                        keyboardOptions =
                                            KeyboardOptions(
                                                keyboardType = KeyboardType.Decimal,
                                            ),
                                        modifier = Modifier.weight(1f),
                                        singleLine = true,
                                        isError = ingredientQuantities[index].let { it == null || it <= 0.0 },
                                    )
                                    val compatibleUnits =
                                        ingredient.foodUnit?.let { foodUnit ->
                                            ServingUnit.entries.filter { isSameUnitDimension(it.value, foodUnit) }
                                        } ?: ServingUnit.entries.toList()
                                    ExposedDropdownMenuBox(
                                        expanded = openUnitDropdownKey == ingredient.key,
                                        onExpandedChange = {
                                            openUnitDropdownKey = if (it) ingredient.key else null
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        OutlinedTextField(
                                            value = ingredient.unit.name.lowercase(),
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text(stringResource(R.string.recipe_edit_unit)) },
                                            trailingIcon = {
                                                ExposedDropdownMenuDefaults.TrailingIcon(
                                                    expanded = openUnitDropdownKey == ingredient.key,
                                                )
                                            },
                                            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
                                            singleLine = true,
                                        )
                                        ExposedDropdownMenu(
                                            expanded = openUnitDropdownKey == ingredient.key,
                                            onDismissRequest = { openUnitDropdownKey = null },
                                        ) {
                                            compatibleUnits.forEach { unit ->
                                                DropdownMenuItem(
                                                    text = { Text(unit.name.lowercase()) },
                                                    onClick = {
                                                        ingredients =
                                                            ingredients.map {
                                                                if (it.key == ingredient.key) it.copy(unit = unit) else it
                                                            }
                                                        openUnitDropdownKey = null
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

                if (ingredients.isEmpty()) {
                    Text(
                        stringResource(R.string.recipe_edit_no_ingredients),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                HorizontalDivider()

                if (stepsAvailable) {
                    RecipeStepsEditor(
                        steps = steps,
                        onStepsChange = { steps = it },
                        onStepUploadingChange = { key, uploading ->
                            uploadingStepKeys = if (uploading) uploadingStepKeys + key else uploadingStepKeys - key
                        },
                    )
                } else {
                    Text(
                        stringResource(R.string.recipe_edit_steps_unavailable),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
                        onClick = {
                            val nameVal = name.trim()
                            val servingsVal = servingsValue?.takeIf { it > 0.0 } ?: return@Button
                            val quantities = ingredientQuantities.map { it?.takeIf { q -> q > 0.0 } ?: return@Button }
                            if (nameVal.isBlank() || ingredients.isEmpty() || ingredients.size > MAX_RECIPE_INGREDIENTS) return@Button
                            isSaving = true
                            errorMessage = null
                            scope.launch {
                                try {
                                    val ingredientInputs =
                                        ingredients.zip(quantities) { ing, quantity ->
                                            RecipeIngredientInput(
                                                foodId = ing.foodId,
                                                quantity = quantity,
                                                servingUnit = ing.unit,
                                            )
                                        }
                                    val cookedWeightVal =
                                        cookedWeightText.toLocalizedDoubleOrNull()?.takeIf { it > 0.0 }
                                    val existingId = (recipeId ?: createdId)?.let { recipeRepo.resolveId(it) }
                                    if (existingId != null) {
                                        val id = existingId
                                        recipeRepo.updateRecipe(
                                            id,
                                            RecipeUpdate(
                                                name = nameVal,
                                                totalServings = servingsVal,
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                                cookedWeight = cookedWeightVal,
                                                steps = if (stepsAvailable) steps.toStepInputs() else null,
                                            ),
                                            cleared =
                                                if (cookedWeightVal == null) setOf(RecipeField.COOKED_WEIGHT) else emptySet(),
                                        )
                                        bodySaved = true
                                        // Labels live in their own table; only an actual edit is
                                        // sent, because a user write replaces whatever a labeller
                                        // seeded.
                                        if (labels != originalLabels) {
                                            recipeRepo.setLabels(id, labels)
                                            originalLabels = labels
                                        }
                                        // Separate from the body: `imageUrl` defaults to
                                        // null on RecipeUpdate and the client omits
                                        // defaults, so a removal sent that way would be
                                        // dropped and the old image would stay.
                                        if (imageUrl != originalImageUrl) {
                                            try {
                                                recipeRepo.setImage(id, imageUrl)
                                                originalImageUrl = imageUrl
                                            } catch (e: Exception) {
                                                if (e is kotlinx.coroutines.CancellationException) throw e
                                                // The recipe is already saved, so this is
                                                // the photo's failure alone; the generic
                                                // save error would be a lie.
                                                Log.e("RecipeEditSheet", "Failed to save recipe image", e)
                                                errorReporter.captureException(e)
                                                errorMessage = imageSaveFailedMessage
                                                isSaving = false
                                                return@launch
                                            }
                                        }
                                    } else {
                                        // No id yet, so the already-uploaded URL rides
                                        // along on the create body.
                                        val created =
                                            recipeRepo.createRecipe(
                                                RecipeCreate(
                                                    name = nameVal,
                                                    totalServings = servingsVal,
                                                    ingredients = ingredientInputs,
                                                    isFavorite = isFavorite,
                                                    imageUrl = imageUrl,
                                                    cookedWeight = cookedWeightVal,
                                                    steps = steps.toStepInputs(),
                                                ),
                                            )
                                        createdId = created.id
                                        originalImageUrl = imageUrl
                                        bodySaved = true
                                        if (labels.isNotEmpty()) recipeRepo.setLabels(created.id, labels)
                                        originalLabels = labels
                                    }
                                    isSaving = false
                                    sheetState.hide()
                                    onSaved()
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    Log.e("RecipeEditSheet", "Failed to save recipe", e)
                                    errorReporter.captureException(e)
                                    errorMessage = saveFailedMessage
                                }
                                isSaving = false
                            }
                        },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        enabled =
                            !isBusy &&
                                name.isNotBlank() &&
                                ingredients.isNotEmpty() &&
                                ingredients.size <= MAX_RECIPE_INGREDIENTS &&
                                ingredientQuantities.all { it != null && it > 0.0 } &&
                                (servingsValue ?: 0.0) > 0.0,
                    ) {
                        Text(stringResource(R.string.action_save), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
