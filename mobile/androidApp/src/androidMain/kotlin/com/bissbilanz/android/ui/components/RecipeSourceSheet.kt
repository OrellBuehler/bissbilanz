package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.RecipeScaleMode
import com.bissbilanz.util.recipeScaleFactor
import com.bissbilanz.util.scaleIngredients
import com.bissbilanz.util.toDisplayString
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

const val MAX_RECIPE_INGREDIENTS = 100

/**
 * Picks a source recipe and an amount of it, then hands back that recipe's ingredients
 * scaled to the amount (a snapshot copy, not a link). [existingCount] is the number of
 * ingredients already in the editor, so the 100-ingredient cap can be enforced here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeSourceSheet(
    existingCount: Int,
    onDismiss: () -> Unit,
    onAdd: (List<RecipeIngredient>) -> Unit,
) {
    val recipeRepo: RecipeRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val recipes by recipeRepo.allRecipes().collectAsStateWithLifecycle(emptyList())
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Recipe?>(null) }
    var amountText by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(RecipeScaleMode.Servings) }
    var isAdding by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val loadFailedMessage = stringResource(R.string.recipe_source_load_failed)
    val noIngredientsMessage = stringResource(R.string.recipe_source_no_ingredients)
    val tooManyMessage = stringResource(R.string.recipe_source_too_many, MAX_RECIPE_INGREDIENTS)
    val servingsLabel = stringResource(R.string.meal_picker_mode_servings)
    val gramsLabel = stringResource(R.string.meal_picker_mode_grams)

    LaunchedEffect(Unit) {
        try {
            recipeRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Log.e("RecipeSourceSheet", "Failed to refresh recipes", e)
            errorReporter.captureException(e)
            errorMessage = loadFailedMessage
        }
    }

    val screenHeight = LocalConfiguration.current.screenHeightDp.dp
    val visibleRecipes =
        remember(recipes, query) {
            recipes
                .filter { it.name.contains(query.trim(), ignoreCase = true) }
                .sortedBy { it.name.lowercase() }
        }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Box(modifier = Modifier.height(screenHeight * 0.9f).imePadding()) {
            val source = selected
            if (source == null) {
                Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                    Text(
                        stringResource(R.string.recipe_edit_add_from_recipe),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = {
                            Text(stringResource(R.string.recipe_list_search_placeholder), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        },
                        leadingIcon = { Icon(Icons.Default.Search, stringResource(R.string.food_search_icon_desc)) },
                        trailingIcon =
                            if (query.isNotEmpty()) {
                                {
                                    IconButton(onClick = { query = "" }) {
                                        Icon(Icons.Default.Close, stringResource(R.string.daylog_search_clear))
                                    }
                                }
                            } else {
                                null
                            },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    errorMessage?.let {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    if (visibleRecipes.isEmpty()) {
                        EmptyState(
                            if (query.isBlank()) {
                                stringResource(R.string.recipe_list_empty)
                            } else {
                                stringResource(R.string.recipe_list_no_results)
                            },
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(bottom = 32.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(visibleRecipes, key = { it.id }) { recipe ->
                                Card(
                                    onClick = {
                                        selected = recipe
                                        amountText = recipe.totalServings.toDisplayString()
                                        mode = RecipeScaleMode.Servings
                                        errorMessage = null
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Text(
                                            recipe.name,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            stringResource(
                                                R.string.recipe_list_item_summary,
                                                recipe.totalServings.toInt(),
                                                recipe.ingredients.size,
                                            ),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                val cookedWeight = source.cookedWeight?.takeIf { it > 0.0 }
                val amount = amountText.toLocalizedDoubleOrNull()
                val factor = amount?.let { recipeScaleFactor(source.totalServings, cookedWeight, it, mode) }
                val previewCalories = factor?.let { source.calories * source.totalServings * it }
                Column(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        source.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    if (cookedWeight != null) {
                        ChoiceDropdown(
                            selectedLabel = if (mode == RecipeScaleMode.Servings) servingsLabel else gramsLabel,
                            options =
                                listOf(
                                    servingsLabel to RecipeScaleMode.Servings,
                                    gramsLabel to RecipeScaleMode.Grams,
                                ),
                            onSelect = {
                                mode = it
                                amountText =
                                    if (it == RecipeScaleMode.Servings) {
                                        source.totalServings.toDisplayString()
                                    } else {
                                        cookedWeight.toDisplayString()
                                    }
                            },
                            label = stringResource(R.string.recipe_source_mode_label),
                        )
                    }
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it },
                        label = {
                            Text(
                                if (mode == RecipeScaleMode.Servings) {
                                    stringResource(R.string.meal_picker_servings_label)
                                } else {
                                    stringResource(R.string.recipe_source_grams_label)
                                },
                            )
                        },
                        supportingText = {
                            Text(
                                if (mode == RecipeScaleMode.Servings || cookedWeight == null) {
                                    stringResource(R.string.recipe_source_of_servings, source.totalServings.toDisplayString())
                                } else {
                                    stringResource(R.string.recipe_source_of_grams, cookedWeight.toDisplayString())
                                },
                            )
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Text(
                        previewCalories?.let { stringResource(R.string.recipe_source_preview_kcal, it.toInt()) } ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.recipe_source_snapshot_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = {
                                selected = null
                                errorMessage = null
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(stringResource(R.string.action_back), maxLines = 1)
                        }
                        Button(
                            onClick = {
                                val scale = factor ?: return@Button
                                isAdding = true
                                errorMessage = null
                                scope.launch {
                                    try {
                                        val sourceIngredients =
                                            source.ingredients.ifEmpty { recipeRepo.getRecipe(source.id).ingredients }
                                        when {
                                            sourceIngredients.isEmpty() -> errorMessage = noIngredientsMessage
                                            existingCount + sourceIngredients.size > MAX_RECIPE_INGREDIENTS -> errorMessage = tooManyMessage
                                            else -> onAdd(scaleIngredients(sourceIngredients, scale))
                                        }
                                    } catch (e: Exception) {
                                        if (e is kotlinx.coroutines.CancellationException) throw e
                                        Log.e("RecipeSourceSheet", "Failed to load source recipe", e)
                                        errorReporter.captureException(e)
                                        errorMessage = loadFailedMessage
                                    }
                                    isAdding = false
                                }
                            },
                            enabled = factor != null && !isAdding,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (isAdding) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text(stringResource(R.string.action_add), maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
}
