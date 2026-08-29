package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FavoritesSkeleton
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.FavoritesViewModel
import com.bissbilanz.model.Food
import com.bissbilanz.model.Recipe
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import org.koin.core.qualifier.named

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(navController: NavController) {
    val viewModel: FavoritesViewModel = koinViewModel()
    val baseUrl: String = koinInject(named("baseUrl"))
    val refreshManager: RefreshManager = koinInject()
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val recipes by viewModel.recipes.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()

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
            title = stringResource(R.string.favorites_select_servings),
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
            title = stringResource(R.string.favorites_select_servings),
            showMealPicker = false,
        )
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = { AppTopBar(stringResource(R.string.favorites_title), scrollBehavior) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = { refreshManager.refreshAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                Spacer(modifier = Modifier.height(8.dp))
                val tabLabels =
                    listOf(
                        stringResource(R.string.favorites_tab_foods, favorites.size),
                        stringResource(R.string.favorites_tab_recipes, favoriteRecipes.size),
                    )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    tabLabels.forEachIndexed { index, label ->
                        SegmentedButton(
                            selected = selectedTab == index,
                            onClick = { viewModel.selectTab(index) },
                            shape = SegmentedButtonDefaults.itemShape(index, tabLabels.size),
                        ) {
                            Text(label)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Crossfade(targetState = isLoading, label = "favorites") { loading ->
                    if (loading) {
                        FavoritesSkeleton()
                    } else if (selectedTab == 0) {
                        if (favorites.isEmpty()) {
                            EmptyState(stringResource(R.string.favorites_no_foods))
                        } else {
                            LazyVerticalGrid(
                                columns = GridCells.Fixed(3),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(favorites, key = { it.id }) { food ->
                                    FavoriteCard(
                                        name = food.name,
                                        imageUrl = food.imageUrl?.let { if (it.startsWith("/")) "$baseUrl$it" else it },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            handleQuickLog(
                                                viewModel = viewModel,
                                                onInstantWithMeal = { meal -> viewModel.logFood(food, meal, 1.0) },
                                                onShowServingsPicker = { pendingServingsFood = food },
                                                onShowMealPicker = { foodToLog = food },
                                            )
                                        },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                            }
                        }
                    } else {
                        if (favoriteRecipes.isEmpty()) {
                            EmptyState(stringResource(R.string.favorites_no_recipes))
                        } else {
                            LazyVerticalGrid(
                                columns = GridCells.Fixed(3),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(favoriteRecipes, key = { it.id }) { recipe ->
                                    FavoriteCard(
                                        name = recipe.name,
                                        imageUrl = recipe.imageUrl?.let { if (it.startsWith("/")) "$baseUrl$it" else it },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            handleQuickLog(
                                                viewModel = viewModel,
                                                onInstantWithMeal = { meal -> viewModel.logRecipe(recipe, meal, 1.0) },
                                                onShowServingsPicker = { pendingServingsRecipe = recipe },
                                                onShowMealPicker = { recipeToLog = recipe },
                                            )
                                        },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                            }
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
    imageUrl: String? = null,
    onQuickLog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(onClick = onQuickLog, modifier = modifier) {
        Column {
            imageUrl?.let { url ->
                FoodImage(
                    imageUrl = url,
                    contentDescription = name,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                )
            }
            Text(
                name,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(8.dp),
            )
        }
    }
}
