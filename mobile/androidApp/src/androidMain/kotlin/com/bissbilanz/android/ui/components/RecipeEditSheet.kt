package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
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
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.model.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.isSameUnitDimension
import com.bissbilanz.util.toDisplayString
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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

    var ingredients by remember { mutableStateOf(listOf<RecipeIngredientRow>()) }
    var openUnitDropdownIndex by remember { mutableStateOf<Int?>(null) }
    var showFoodPicker by remember { mutableStateOf(false) }
    var foodSearchQuery by remember { mutableStateOf("") }
    var foodSearchResults by remember { mutableStateOf<List<Food>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchJob by remember { mutableStateOf<Job?>(null) }
    var offResults by remember { mutableStateOf<List<OpenFoodFactsProduct>>(emptyList()) }
    var isSearchingOff by remember { mutableStateOf(false) }
    var isResolvingOff by remember { mutableStateOf(false) }

    val loadFailedMessage = stringResource(R.string.recipe_edit_load_failed)
    val saveFailedMessage = stringResource(R.string.recipe_edit_save_failed)
    val offFailedMessage = stringResource(R.string.food_search_off_add_failed)
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
        fun addIngredient(food: Food) {
            ingredients = ingredients +
                RecipeIngredientRow(
                    food = food,
                    foodId = food.id,
                    quantity = food.servingSize.toDisplayString(),
                    unit = ServingUnit.entries.first { it.value == food.servingUnit.value },
                )
            showFoodPicker = false
            searchJob?.cancel()
            isSearching = false
            isSearchingOff = false
            foodSearchQuery = ""
            foodSearchResults = emptyList()
            offResults = emptyList()
        }

        AlertDialog(
            onDismissRequest = { showFoodPicker = false },
            title = { Text(stringResource(R.string.recipe_edit_add_ingredient)) },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    OutlinedTextField(
                        value = foodSearchQuery,
                        onValueChange = { query ->
                            foodSearchQuery = query
                            searchJob?.cancel()
                            if (query.length >= 2) {
                                isSearching = true
                                offResults = emptyList()
                                searchJob =
                                    scope.launch {
                                        delay(300)
                                        val results =
                                            try {
                                                foodRepo.searchFoods(query)
                                            } catch (e: Exception) {
                                                if (e is kotlinx.coroutines.CancellationException) throw e
                                                Log.e("RecipeEditSheet", "Food search failed", e)
                                                errorReporter.captureException(e)
                                                emptyList()
                                            }
                                        foodSearchResults = results
                                        isSearching = false
                                        // Same rule as the main food search: only reach for
                                        // Open Food Facts when the user's own database is thin.
                                        if (results.size < OFF_FALLBACK_THRESHOLD) {
                                            isSearchingOff = true
                                            try {
                                                offResults = foodRepo.searchOpenFoodFacts(query)
                                            } catch (e: Exception) {
                                                if (e is kotlinx.coroutines.CancellationException) throw e
                                                errorReporter.captureException(e)
                                                offResults = emptyList()
                                            } finally {
                                                isSearchingOff = false
                                            }
                                        }
                                    }
                            } else {
                                // The cancelled job never reaches its own `isSearching =
                                // false`, so backspacing from "ab" to "a" left the
                                // spinner up for good.
                                isSearching = false
                                isSearchingOff = false
                                foodSearchResults = emptyList()
                                offResults = emptyList()
                            }
                        },
                        label = { Text(stringResource(R.string.recipe_edit_search_food)) },
                        leadingIcon = { Icon(Icons.Default.Search, stringResource(R.string.food_search_icon_desc)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (isSearching) {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                        )
                    } else {
                        foodSearchResults.take(5).forEach { food ->
                            TextButton(
                                onClick = { addIngredient(food) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    "${food.name}${food.brand?.let { " ($it)" } ?: ""}",
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        if (isSearchingOff || offResults.isNotEmpty()) {
                            Text(
                                stringResource(R.string.food_search_off_section),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 8.dp),
                            )
                        }
                        if (isSearchingOff) {
                            CircularProgressIndicator(
                                modifier = Modifier.align(Alignment.CenterHorizontally).size(20.dp),
                            )
                        } else {
                            // Copy-on-use: the product becomes a food in the user's own
                            // database (or resolves to the one already on that barcode)
                            // before it can be an ingredient.
                            offResults.take(5).forEach { product ->
                                OpenFoodFactsListItem(
                                    product = product,
                                    enabled = !isResolvingOff,
                                    onClick = {
                                        if (isResolvingOff) return@OpenFoodFactsListItem
                                        isResolvingOff = true
                                        scope.launch {
                                            try {
                                                val food = foodRepo.findOrCreateByBarcode(product.barcode)
                                                if (food != null) {
                                                    addIngredient(food)
                                                } else {
                                                    errorMessage = offFailedMessage
                                                }
                                            } catch (e: Exception) {
                                                if (e is kotlinx.coroutines.CancellationException) throw e
                                                Log.e("RecipeEditSheet", "Open Food Facts import failed", e)
                                                errorReporter.captureException(e)
                                                errorMessage = offFailedMessage
                                            } finally {
                                                isResolvingOff = false
                                            }
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showFoodPicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
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
                                            ),
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

/** Below this many own-database hits the ingredient picker falls back to Open Food Facts. */
private const val OFF_FALLBACK_THRESHOLD = 5
