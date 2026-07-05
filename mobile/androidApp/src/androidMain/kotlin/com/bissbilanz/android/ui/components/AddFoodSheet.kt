package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.FoodListItem
import com.bissbilanz.android.ui.screens.RecipeListItem
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.viewmodels.AddFoodViewModel
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import com.bissbilanz.util.toLocalizedDoubleOrNull
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import org.koin.core.qualifier.named

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddFoodSheet(
    mealType: String,
    date: String,
    onDismiss: () -> Unit,
    onLogged: () -> Unit,
) {
    val viewModel: AddFoodViewModel = koinViewModel()
    val baseUrl: String = koinInject(named("baseUrl"))
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(Unit) { viewModel.reset() }

    val query by viewModel.query.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val recentFoods by viewModel.recentFoods.collectAsStateWithLifecycle()
    val favoriteFoods by viewModel.favoriteFoods.collectAsStateWithLifecycle()
    val favoriteRecipes by viewModel.favoriteRecipes.collectAsStateWithLifecycle()
    val recipes by viewModel.allRecipes.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val isSaving by viewModel.isSaving.collectAsStateWithLifecycle()

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabLabels =
        listOf(
            stringResource(R.string.add_food_tab_search),
            stringResource(R.string.favorites_title),
            stringResource(R.string.food_search_tab_recent),
            stringResource(R.string.recipe_list_title),
            stringResource(R.string.add_food_tab_quick),
        )

    var selectedFood by remember { mutableStateOf<Food?>(null) }
    var selectedRecipe by remember { mutableStateOf<Recipe?>(null) }
    var servingsText by remember { mutableStateOf("1") }

    var quickName by remember { mutableStateOf("") }
    var quickCalories by remember { mutableStateOf("") }
    var quickProtein by remember { mutableStateOf("") }
    var quickCarbs by remember { mutableStateOf("") }
    var quickFat by remember { mutableStateOf("") }
    var quickFiber by remember { mutableStateOf("") }
    var quickNotes by remember { mutableStateOf("") }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    val screenHeight = LocalConfiguration.current.screenHeightDp.dp

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .height(screenHeight * 0.7f)
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 16.dp)
                    .imePadding(),
        ) {
            if (selectedFood != null || selectedRecipe != null) {
                val name = selectedFood?.name ?: selectedRecipe?.name ?: ""
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    IconButton(onClick = {
                        selectedFood = null
                        selectedRecipe = null
                        servingsText = "1"
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                    Text(
                        name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = servingsText,
                    onValueChange = { servingsText = it },
                    label = { Text(stringResource(R.string.meal_picker_servings_label)) },
                    keyboardOptions =
                        KeyboardOptions(
                            keyboardType = KeyboardType.Decimal,
                        ),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(16.dp))
                if (isSaving) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            selectedFood = null
                            selectedRecipe = null
                            servingsText = "1"
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving,
                    ) { Text(stringResource(R.string.dialog_cancel)) }
                    Button(
                        onClick = {
                            val servings = servingsText.toLocalizedDoubleOrNull() ?: 1.0
                            if (selectedFood != null) {
                                viewModel.logFood(selectedFood!!, mealType, servings, date) { onLogged() }
                            } else if (selectedRecipe != null) {
                                viewModel.logRecipe(selectedRecipe!!, mealType, servings, date) { onLogged() }
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving,
                    ) { Text(stringResource(R.string.food_detail_log)) }
                }
                Spacer(modifier = Modifier.height(16.dp))
            } else {
                Text(
                    stringResource(R.string.add_food_title, mealTypeDisplayName(mealType)),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                Spacer(modifier = Modifier.height(12.dp))

                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    tabLabels.forEachIndexed { index, label ->
                        SegmentedButton(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            shape = SegmentedButtonDefaults.itemShape(index, tabLabels.size),
                            icon = {},
                        ) {
                            Text(label, maxLines = 1)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Box(modifier = Modifier.weight(1f)) {
                    when (selectedTab) {
                        0 -> {
                            SearchTab(
                                viewModel,
                                baseUrl,
                                query,
                                searchResults,
                                isSearching,
                                onSelect = { selectedFood = it },
                            )
                        }

                        1 -> {
                            FavoritesTab(
                                favoriteFoods,
                                favoriteRecipes,
                                baseUrl,
                                onSelectFood = { selectedFood = it },
                                onSelectRecipe = { selectedRecipe = it },
                            )
                        }

                        2 -> {
                            RecentTab(recentFoods, baseUrl, onSelect = { selectedFood = it })
                        }

                        3 -> {
                            RecipesTab(recipes, onSelect = { selectedRecipe = it })
                        }

                        4 -> {
                            QuickTab(
                                quickName,
                                quickCalories,
                                quickProtein,
                                quickCarbs,
                                quickFat,
                                quickFiber,
                                quickNotes,
                                isSaving,
                                onNameChange = { quickName = it },
                                onCaloriesChange = { quickCalories = it },
                                onProteinChange = { quickProtein = it },
                                onCarbsChange = { quickCarbs = it },
                                onFatChange = { quickFat = it },
                                onFiberChange = { quickFiber = it },
                                onNotesChange = { quickNotes = it },
                                onSave = {
                                    viewModel.logQuickEntry(
                                        mealType,
                                        date,
                                        quickName,
                                        quickCalories.toLocalizedDoubleOrNull(),
                                        quickProtein.toLocalizedDoubleOrNull(),
                                        quickCarbs.toLocalizedDoubleOrNull(),
                                        quickFat.toLocalizedDoubleOrNull(),
                                        quickFiber.toLocalizedDoubleOrNull(),
                                        quickNotes,
                                    ) { onLogged() }
                                },
                            )
                        }
                    }
                }
            }
        }

        SnackbarHost(snackbarHostState)
    }
}

@Composable
private fun SearchTab(
    viewModel: AddFoodViewModel,
    baseUrl: String,
    query: String,
    searchResults: List<Food>,
    isSearching: Boolean,
    onSelect: (Food) -> Unit,
) {
    Column {
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.updateQuery(it) },
            placeholder = { Text(stringResource(R.string.food_search_placeholder)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(modifier = Modifier.height(8.dp))
        if (query.length >= 2) {
            if (isSearching) {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else if (searchResults.isEmpty()) {
                EmptyState(stringResource(R.string.food_search_no_results, query))
            } else {
                LazyColumn(modifier = Modifier.fillMaxHeight()) {
                    items(searchResults, key = { it.id }) { food ->
                        FoodListItem(
                            food = food,
                            baseUrl = baseUrl,
                            onClick = { onSelect(food) },
                            onQuickLog = { onSelect(food) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FavoritesTab(
    favoriteFoods: List<Food>,
    favoriteRecipes: List<Recipe>,
    baseUrl: String,
    onSelectFood: (Food) -> Unit,
    onSelectRecipe: (Recipe) -> Unit,
) {
    if (favoriteFoods.isEmpty() && favoriteRecipes.isEmpty()) {
        EmptyState(stringResource(R.string.add_food_no_favorites))
    } else {
        LazyColumn(modifier = Modifier.fillMaxHeight()) {
            items(favoriteFoods, key = { "food-${it.id}" }) { food ->
                FoodListItem(
                    food = food,
                    baseUrl = baseUrl,
                    onClick = { onSelectFood(food) },
                    onQuickLog = { onSelectFood(food) },
                )
            }
            items(favoriteRecipes, key = { "recipe-${it.id}" }) { recipe ->
                RecipeListItem(
                    recipe = recipe,
                    onClick = { onSelectRecipe(recipe) },
                    onQuickLog = { onSelectRecipe(recipe) },
                )
            }
        }
    }
}

@Composable
private fun RecentTab(
    recentFoods: List<Food>,
    baseUrl: String,
    onSelect: (Food) -> Unit,
) {
    if (recentFoods.isEmpty()) {
        EmptyState(stringResource(R.string.food_search_no_recent))
    } else {
        LazyColumn(modifier = Modifier.fillMaxHeight()) {
            items(recentFoods, key = { it.id }) { food ->
                FoodListItem(
                    food = food,
                    baseUrl = baseUrl,
                    onClick = { onSelect(food) },
                    onQuickLog = { onSelect(food) },
                )
            }
        }
    }
}

@Composable
private fun RecipesTab(
    recipes: List<Recipe>,
    onSelect: (Recipe) -> Unit,
) {
    if (recipes.isEmpty()) {
        EmptyState(stringResource(R.string.add_food_no_recipes))
    } else {
        LazyColumn(modifier = Modifier.fillMaxHeight()) {
            items(recipes, key = { it.id }) { recipe ->
                RecipeListItem(
                    recipe = recipe,
                    onClick = { onSelect(recipe) },
                    onQuickLog = { onSelect(recipe) },
                )
            }
        }
    }
}

@Composable
private fun QuickTab(
    name: String,
    calories: String,
    protein: String,
    carbs: String,
    fat: String,
    fiber: String,
    notes: String,
    isSaving: Boolean,
    onNameChange: (String) -> Unit,
    onCaloriesChange: (String) -> Unit,
    onProteinChange: (String) -> Unit,
    onCarbsChange: (String) -> Unit,
    onFatChange: (String) -> Unit,
    onFiberChange: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text(stringResource(R.string.food_form_name)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        NutrientTextField(stringResource(R.string.add_food_quick_calories), calories, CaloriesBlue, onCaloriesChange)
        NutrientTextField(stringResource(R.string.add_food_quick_protein), protein, ProteinRed, onProteinChange)
        NutrientTextField(stringResource(R.string.add_food_quick_carbs), carbs, CarbsOrange, onCarbsChange)
        NutrientTextField(stringResource(R.string.add_food_quick_fat), fat, FatYellow, onFatChange)
        NutrientTextField(stringResource(R.string.food_form_fiber_optional), fiber, FiberGreen, onFiberChange)
        OutlinedTextField(
            value = notes,
            onValueChange = onNotesChange,
            label = { Text(stringResource(R.string.weight_notes_label)) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            maxLines = 4,
        )
        if (isSaving) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth(),
            enabled = name.isNotBlank() && !isSaving,
        ) { Text(stringResource(R.string.weight_save)) }
        Spacer(modifier = Modifier.height(16.dp))
    }
}
