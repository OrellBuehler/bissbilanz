package com.bissbilanz.android.ui.components

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import android.util.Log
import com.bissbilanz.model.*
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private data class RecipeRecipeIngredientRow(
    val food: Food? = null,
    val foodId: String = "",
    val quantity: String = "100",
    val unit: ServingUnit = ServingUnit.G,
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

    LaunchedEffect(recipeId) {
        if (recipeId != null) {
            try {
                val recipe = recipeRepo.getRecipe(recipeId)
                name = recipe.name
                totalServings = recipe.totalServings.let {
                    if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                }
                isFavorite = recipe.isFavorite
                ingredients = recipe.ingredients?.map { ing ->
                    RecipeIngredientRow(
                        food = ing.food,
                        foodId = ing.foodId,
                        quantity = ing.quantity.let {
                            if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
                        },
                        unit = ing.servingUnit,
                    )
                } ?: emptyList()
            } catch (e: Exception) {
                Log.e("RecipeEditSheet", "Failed to load recipe", e)
                errorMessage = "Failed to load recipe"
            }
            isLoading = false
        }
    }

    if (showFoodPicker) {
        AlertDialog(
            onDismissRequest = { showFoodPicker = false },
            title = { Text("Add Ingredient") },
            text = {
                Column {
                    OutlinedTextField(
                        value = foodSearchQuery,
                        onValueChange = { query ->
                            foodSearchQuery = query
                            searchJob?.cancel()
                            if (query.length >= 2) {
                                isSearching = true
                                searchJob = scope.launch {
                                    delay(300)
                                    try {
                                        foodSearchResults = foodRepo.searchFoods(query)
                                    } catch (e: Exception) {
                                        Log.e("RecipeEditSheet", "Food search failed", e)
                                        foodSearchResults = emptyList()
                                    }
                                    isSearching = false
                                }
                            }
                        },
                        label = { Text("Search food") },
                        leadingIcon = { Icon(Icons.Default.Search, "Search") },
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
                                onClick = {
                                    ingredients = ingredients + RecipeIngredientRow(
                                        food = food,
                                        foodId = food.id,
                                        quantity = food.servingSize.let {
                                            if (it == it.toLong().toDouble()) {
                                                it.toLong().toString()
                                            } else {
                                                it.toString()
                                            }
                                        },
                                        unit = food.servingUnit,
                                    )
                                    showFoodPicker = false
                                    foodSearchQuery = ""
                                    foodSearchResults = emptyList()
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    "${food.name}${food.brand?.let { " ($it)" } ?: ""}",
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showFoodPicker = false }) { Text("Cancel") }
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
                modifier = Modifier
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (isEditing) "Edit Recipe" else "Create Recipe",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Recipe name *") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = totalServings,
                    onValueChange = { totalServings = it },
                    label = { Text("Total servings") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
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
                    FilledTonalButton(onClick = { showFoodPicker = true }) {
                        Icon(Icons.Default.Add, "Add", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Add")
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
                                    ingredient.food?.name ?: "Food",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(
                                    onClick = {
                                        ingredients = ingredients.toMutableList().apply {
                                            removeAt(index)
                                        }
                                    },
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        "Remove",
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = ingredient.quantity,
                                    onValueChange = { newQty ->
                                        ingredients = ingredients.toMutableList().apply {
                                            set(index, ingredient.copy(quantity = newQty))
                                        }
                                    },
                                    label = { Text("Amount") },
                                    keyboardOptions = KeyboardOptions(
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
                        "No ingredients added yet.\nTap Add to search for foods.",
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
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            val nameVal = name.trim()
                            if (nameVal.isBlank() || ingredients.isEmpty()) return@Button
                            isSaving = true
                            scope.launch {
                                try {
                                    val ingredientInputs = ingredients.map { ing ->
                                        RecipeIngredientInput(
                                            foodId = ing.foodId,
                                            quantity = ing.quantity.toDoubleOrNull() ?: 100.0,
                                            servingUnit = ing.unit,
                                        )
                                    }
                                    if (isEditing) {
                                        val id = recipeId ?: return@launch
                                        recipeRepo.updateRecipe(
                                            id,
                                            RecipeUpdate(
                                                name = nameVal,
                                                totalServings = totalServings.toDoubleOrNull()
                                                    ?: 1.0,
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                            ),
                                        )
                                    } else {
                                        recipeRepo.createRecipe(
                                            RecipeCreate(
                                                name = nameVal,
                                                totalServings = totalServings.toDoubleOrNull()
                                                    ?: 1.0,
                                                ingredients = ingredientInputs,
                                                isFavorite = isFavorite,
                                            ),
                                        )
                                    }
                                    sheetState.hide()
                                    onSaved()
                                } catch (e: Exception) {
                                    Log.e("RecipeEditSheet", "Failed to save recipe", e)
                                    errorMessage = "Failed to save recipe"
                                }
                                isSaving = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && name.isNotBlank() && ingredients.isNotEmpty(),
                    ) {
                        Text("Save")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}
