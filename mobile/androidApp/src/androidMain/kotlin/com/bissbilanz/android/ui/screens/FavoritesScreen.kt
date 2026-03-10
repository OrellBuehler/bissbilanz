package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.FavoritesViewModel
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import org.koin.androidx.compose.koinViewModel

@Composable
fun FavoritesScreen(navController: NavController) {
    val viewModel: FavoritesViewModel = koinViewModel()
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val recipes by viewModel.recipes.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    var foodToLog by remember { mutableStateOf<Food?>(null) }
    var recipeToLog by remember { mutableStateOf<Recipe?>(null) }
    var pendingServingsFood by remember { mutableStateOf<Food?>(null) }
    var pendingServingsRecipe by remember { mutableStateOf<Recipe?>(null) }

    val favoriteRecipes = recipes.filter { it.isFavorite }

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    if (foodToLog != null) {
        MealPickerSheet(
            onDismiss = { foodToLog = null },
            onConfirm = { meal, servings ->
                viewModel.logFood(foodToLog!!, meal, servings)
                foodToLog = null
            },
        )
    }

    if (recipeToLog != null) {
        MealPickerSheet(
            onDismiss = { recipeToLog = null },
            onConfirm = { meal, servings ->
                viewModel.logRecipe(recipeToLog!!, meal, servings)
                recipeToLog = null
            },
        )
    }

    if (pendingServingsFood != null) {
        MealPickerSheet(
            onDismiss = { pendingServingsFood = null },
            onConfirm = { _, servings ->
                val meal = viewModel.resolveDefaultMeal()
                if (meal != null) {
                    viewModel.logFood(pendingServingsFood!!, meal, servings)
                    pendingServingsFood = null
                } else {
                    foodToLog = pendingServingsFood
                    pendingServingsFood = null
                }
            },
            title = "Select Servings",
            showMealPicker = false,
        )
    }

    if (pendingServingsRecipe != null) {
        MealPickerSheet(
            onDismiss = { pendingServingsRecipe = null },
            onConfirm = { _, servings ->
                val meal = viewModel.resolveDefaultMeal()
                if (meal != null) {
                    viewModel.logRecipe(pendingServingsRecipe!!, meal, servings)
                    pendingServingsRecipe = null
                } else {
                    recipeToLog = pendingServingsRecipe
                    pendingServingsRecipe = null
                }
            },
            title = "Select Servings",
            showMealPicker = false,
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            Spacer(modifier = Modifier.height(8.dp))
            Text("Favorites", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))

            TabRow(selectedTabIndex = selectedTab) {
                Tab(selected = selectedTab == 0, onClick = { viewModel.selectTab(0) }, text = { Text("Foods (${favorites.size})") })
                Tab(selected = selectedTab == 1, onClick = { viewModel.selectTab(1) }, text = { Text("Recipes (${favoriteRecipes.size})") })
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (isLoading) {
                LoadingScreen()
            } else if (selectedTab == 0) {
                if (favorites.isEmpty()) {
                    EmptyState("No favorite foods yet.\nMark foods as favorite to see them here.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(favorites) { food ->
                            FavoriteCard(
                                name = food.name,
                                subtitle = "${food.calories.toInt()} cal",
                                secondaryText = "P${food.protein.toInt()} C${food.carbs.toInt()} F${food.fat.toInt()}",
                                onClick = { navController.navigate("food/${food.id}") },
                                onQuickLog = {
                                    handleQuickLog(
                                        viewModel = viewModel,
                                        onInstantWithMeal = { meal -> viewModel.logFood(food, meal, 1.0) },
                                        onShowServingsPicker = { pendingServingsFood = food },
                                        onShowMealPicker = { foodToLog = food },
                                    )
                                },
                            )
                        }
                    }
                }
            } else {
                if (favoriteRecipes.isEmpty()) {
                    EmptyState("No favorite recipes yet.\nMark recipes as favorite to see them here.")
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(favoriteRecipes) { recipe ->
                            FavoriteCard(
                                name = recipe.name,
                                subtitle = "${recipe.totalServings.toInt()} servings",
                                secondaryText = "${recipe.ingredients?.size ?: 0} ingredients",
                                onClick = { navController.navigate("recipe/${recipe.id}") },
                                onQuickLog = {
                                    handleQuickLog(
                                        viewModel = viewModel,
                                        onInstantWithMeal = { meal -> viewModel.logRecipe(recipe, meal, 1.0) },
                                        onShowServingsPicker = { pendingServingsRecipe = recipe },
                                        onShowMealPicker = { recipeToLog = recipe },
                                    )
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun handleQuickLog(
    viewModel: FavoritesViewModel,
    onInstantWithMeal: (String) -> Unit,
    onShowServingsPicker: () -> Unit,
    onShowMealPicker: () -> Unit,
) {
    val meal = viewModel.resolveDefaultMeal()

    if (viewModel.tapAction == "picker") {
        if (meal != null) {
            onShowServingsPicker()
        } else {
            onShowMealPicker()
        }
        return
    }

    if (meal != null) {
        onInstantWithMeal(meal)
    } else {
        onShowMealPicker()
    }
}

@Composable
fun FavoriteCard(
    name: String,
    subtitle: String,
    secondaryText: String,
    onClick: () -> Unit,
    onQuickLog: () -> Unit,
) {
    Card(modifier = Modifier.clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = CaloriesBlue,
            )
            Text(
                secondaryText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            FilledTonalButton(
                onClick = onQuickLog,
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Icon(Icons.Default.Add, "Log", modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Quick log", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
