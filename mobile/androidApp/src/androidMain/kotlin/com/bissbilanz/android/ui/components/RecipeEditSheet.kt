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
    val isEditing = recipeId != null

    var name by remember { mutableStateOf("") }
    var totalServings by remember { mutableStateOf("1") }
    var isFavorite by remember { mutableStateOf(false) }

    var ingredients by remember { mutableStateOf(listOf<RecipeIngredientRow>()) }
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

    LaunchedEffect(recipeId) {
        if (recipeId != null) {
            try {
                val recipe = recipeRepo.getRecipe(recipeId)
                name = recipe.name
                totalServings = recipe.totalServings.toDisplayString()
                isFavorite = recipe.isFavorite
                ingredients =
                    recipe.ingredients.map { ing ->
                        RecipeIngredientRow(
                            food = null,
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
                    if (isEditing) stringResource(R.string.recipe_edit_edit_title) else stringResource(R.string.recipe_edit_create_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
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
                                Text(
                                    ingredient.unit.name.lowercase(),
                                    modifier = Modifier.align(Alignment.CenterVertically),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
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
                            scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
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
                                                    totalServings.toLocalizedDoubleOrNull()
                                                        ?: 1.0,
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                            ),
                                        )
                                    } else {
                                        recipeRepo.createRecipe(
                                            RecipeCreate(
                                                name = nameVal,
                                                totalServings =
                                                    totalServings.toLocalizedDoubleOrNull()
                                                        ?: 1.0,
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
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
                        enabled = !isSaving && name.isNotBlank() && ingredients.isNotEmpty(),
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
