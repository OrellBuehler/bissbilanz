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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.model.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.RecipeField
import com.bissbilanz.util.RecipeStepDraft
import com.bissbilanz.util.caloriesPerHundredGrams
import com.bissbilanz.util.isSameUnitDimension
import com.bissbilanz.util.newTempId
import com.bissbilanz.util.toDisplayString
import com.bissbilanz.util.toLocalizedDoubleOrNull
import com.bissbilanz.util.toStepInputs
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private data class RecipeIngredientRow(
    val food: Food? = null,
    val foodId: String = "",
    val quantity: String = "100",
    val unit: ServingUnit = ServingUnit.g,
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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var isLoading by remember { mutableStateOf(recipeId != null) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    // The recipe itself saved but its image didn't: the sheet stays open with the photo
    // error, so leaving it still has to report the save the caller's list must reflect.
    var bodySaved by remember { mutableStateOf(false) }
    val isEditing = recipeId != null

    var name by remember { mutableStateOf("") }
    var totalServings by remember { mutableStateOf("1") }
    var isFavorite by remember { mutableStateOf(false) }
    var imageUrl by remember { mutableStateOf<String?>(null) }
    var originalImageUrl by remember { mutableStateOf<String?>(null) }
    var cookedWeightText by remember { mutableStateOf("") }
    var loadedCalories by remember { mutableStateOf<Double?>(null) }

    var ingredients by remember { mutableStateOf(listOf<RecipeIngredientRow>()) }
    var steps by remember { mutableStateOf(listOf<RecipeStepDraft>()) }
    // False when the recipe came from a cache that never downloaded its steps (offline
    // after a list-only refresh): the editor is hidden and a save leaves them untouched
    // rather than sending an empty list that would clear them on the server.
    var stepsAvailable by remember { mutableStateOf(true) }
    var openUnitDropdownIndex by remember { mutableStateOf<Int?>(null) }
    var showFoodPicker by remember { mutableStateOf(false) }
    var showRecipeSource by remember { mutableStateOf(false) }

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
        if (recipeId != null) {
            try {
                val recipe = recipeRepo.getRecipe(recipeId)
                name = recipe.name
                totalServings = recipe.totalServings.toDisplayString()
                isFavorite = recipe.isFavorite
                imageUrl = recipe.imageUrl
                originalImageUrl = recipe.imageUrl
                cookedWeightText = recipe.cookedWeight?.toDisplayString() ?: ""
                loadedCalories = recipe.calories
                stepsAvailable = recipe.steps != null
                steps =
                    recipe.steps.orEmpty().sortedBy { it.sortOrder }.map {
                        RecipeStepDraft(key = newTempId(), text = it.text, imageUrl = it.imageUrl)
                    }
                ingredients =
                    recipe.ingredients.map { ing ->
                        RecipeIngredientRow(
                            food = resolveFood(ing.foodId),
                            foodId = ing.foodId,
                            quantity = ing.quantity.toDisplayString(),
                            unit = ServingUnit.entries.first { it.value == ing.servingUnit.value },
                        )
                    }
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
                ingredients = ingredients +
                    RecipeIngredientRow(
                        food = food,
                        foodId = food.id,
                        quantity = food.servingSize.toDisplayString(),
                        unit = ServingUnit.entries.first { it.value == food.servingUnit.value },
                    )
                showFoodPicker = false
            },
        )
    }

    if (showRecipeSource) {
        RecipeSourceSheet(
            existingCount = ingredients.size,
            onDismiss = { showRecipeSource = false },
            onAdd = { scaled ->
                showRecipeSource = false
                scope.launch {
                    val rows =
                        scaled.map { ing ->
                            RecipeIngredientRow(
                                food = resolveFood(ing.foodId),
                                foodId = ing.foodId,
                                quantity = ing.quantity.toDisplayString(),
                                unit = ServingUnit.entries.first { it.value == ing.servingUnit.value },
                            )
                        }
                    ingredients = ingredients + rows
                }
            },
        )
    }

    ModalBottomSheet(
        onDismissRequest = { close() },
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
                    if (isEditing) stringResource(R.string.recipe_edit_edit_title) else stringResource(R.string.recipe_edit_create_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                FoodImageField(
                    imageUrl = imageUrl,
                    onImageUrlChange = { imageUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = stringResource(R.string.recipe_image_label),
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
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
                                    totalServings.toLocalizedDoubleOrNull() ?: 1.0,
                                )
                            }
                        Text(
                            perHundredG?.let {
                                stringResource(R.string.recipe_edit_cooked_weight_per_100g, it.toInt())
                            } ?: stringResource(R.string.recipe_edit_cooked_weight_hint),
                        )
                    },
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
                    FilledTonalButton(onClick = { showFoodPicker = true }) {
                        Icon(Icons.Default.Add, stringResource(R.string.action_add), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.action_add))
                    }
                }

                OutlinedButton(
                    onClick = { showRecipeSource = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.recipe_edit_add_from_recipe), maxLines = 1)
                }

                ingredients.forEachIndexed { index, ingredient ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    ingredient.food?.name ?: stringResource(R.string.food_detail_default_title),
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(
                                    onClick = {
                                        ingredients =
                                            ingredients.toMutableList().apply {
                                                removeAt(index)
                                            }
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
                                            ingredients.toMutableList().apply {
                                                set(index, ingredient.copy(quantity = newQty))
                                            }
                                    },
                                    label = { Text(stringResource(R.string.recipe_edit_amount)) },
                                    keyboardOptions =
                                        KeyboardOptions(
                                            keyboardType = KeyboardType.Decimal,
                                        ),
                                    modifier = Modifier.weight(1f),
                                    singleLine = true,
                                )
                                val compatibleUnits =
                                    ingredient.food?.servingUnit?.let { foodUnit ->
                                        ServingUnit.entries.filter { isSameUnitDimension(it.value, foodUnit.value) }
                                    } ?: ServingUnit.entries.toList()
                                ExposedDropdownMenuBox(
                                    expanded = openUnitDropdownIndex == index,
                                    onExpandedChange = {
                                        openUnitDropdownIndex = if (it) index else null
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
                                                expanded = openUnitDropdownIndex == index,
                                            )
                                        },
                                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
                                        singleLine = true,
                                    )
                                    ExposedDropdownMenu(
                                        expanded = openUnitDropdownIndex == index,
                                        onDismissRequest = { openUnitDropdownIndex = null },
                                    ) {
                                        compatibleUnits.forEach { unit ->
                                            DropdownMenuItem(
                                                text = { Text(unit.name.lowercase()) },
                                                onClick = {
                                                    ingredients =
                                                        ingredients.toMutableList().apply {
                                                            set(index, ingredient.copy(unit = unit))
                                                        }
                                                    openUnitDropdownIndex = null
                                                },
                                            )
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
                    RecipeStepsEditor(steps = steps, onStepsChange = { steps = it })
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

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            scope.launch { sheetState.hide() }.invokeOnCompletion { close() }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(stringResource(R.string.dialog_cancel))
                    }
                    Button(
                        onClick = {
                            val nameVal = name.trim()
                            if (nameVal.isBlank() || ingredients.isEmpty()) return@Button
                            isSaving = true
                            scope.launch {
                                try {
                                    val ingredientInputs =
                                        ingredients.map { ing ->
                                            RecipeIngredientInput(
                                                foodId = ing.foodId,
                                                quantity = ing.quantity.toLocalizedDoubleOrNull() ?: 100.0,
                                                servingUnit = ing.unit,
                                            )
                                        }
                                    val cookedWeightVal =
                                        cookedWeightText.toLocalizedDoubleOrNull()?.takeIf { it > 0.0 }
                                    if (isEditing) {
                                        val id = recipeId ?: return@launch
                                        recipeRepo.updateRecipe(
                                            id,
                                            RecipeUpdate(
                                                name = nameVal,
                                                totalServings =
                                                    (totalServings.toLocalizedDoubleOrNull() ?: 1.0)
                                                        .coerceAtLeast(1.0),
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                                cookedWeight = cookedWeightVal,
                                                steps = if (stepsAvailable) steps.toStepInputs() else null,
                                            ),
                                            cleared =
                                                if (cookedWeightVal == null) setOf(RecipeField.COOKED_WEIGHT) else emptySet(),
                                        )
                                        bodySaved = true
                                        // Separate from the body: `imageUrl` defaults to
                                        // null on RecipeUpdate and the client omits
                                        // defaults, so a removal sent that way would be
                                        // dropped and the old image would stay.
                                        if (imageUrl != originalImageUrl) {
                                            try {
                                                recipeRepo.setImage(id, imageUrl)
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
                                        recipeRepo.createRecipe(
                                            RecipeCreate(
                                                name = nameVal,
                                                totalServings =
                                                    (totalServings.toLocalizedDoubleOrNull() ?: 1.0)
                                                        .coerceAtLeast(1.0),
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                                imageUrl = imageUrl,
                                                cookedWeight = cookedWeightVal,
                                                steps = steps.toStepInputs(),
                                            ),
                                        )
                                    }
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
                        modifier = Modifier.weight(1f),
                        enabled =
                            !isSaving &&
                                name.isNotBlank() &&
                                ingredients.isNotEmpty() &&
                                (totalServings.toLocalizedDoubleOrNull() ?: 0.0) > 0.0,
                    ) {
                        Text(stringResource(R.string.weight_save))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
