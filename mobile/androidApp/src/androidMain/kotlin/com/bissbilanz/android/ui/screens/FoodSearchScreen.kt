package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.FoodSearchSkeleton
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.android.ui.components.openFoodFactsSection
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.model.Food
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodSearchScreen(navController: NavController) {
    val viewModel: FoodSearchViewModel = koinViewModel()
    val refreshManager: RefreshManager = koinInject()
    val recentFoods by viewModel.recentFoods.collectAsStateWithLifecycle()
    val allFoods by viewModel.allFoods.collectAsStateWithLifecycle()
    val isLoadingMore by viewModel.isLoadingMore.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val offResults by viewModel.offResults.collectAsStateWithLifecycle()
    val isSearchingOff by viewModel.isSearchingOff.collectAsStateWithLifecycle()
    val isResolvingOff by viewModel.isResolvingOff.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    var foodToLog by remember { mutableStateOf<Food?>(null) }
    var showCreateFoodSheet by remember { mutableStateOf(false) }
    var showCreateRecipeSheet by remember { mutableStateOf(false) }
    var showCreateMenu by remember { mutableStateOf(false) }
    var foodToEdit by remember { mutableStateOf<Food?>(null) }

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

    if (showCreateFoodSheet) {
        FoodEditSheet(
            foodId = null,
            onDismiss = { showCreateFoodSheet = false },
            onSaved = {
                showCreateFoodSheet = false
                viewModel.refresh()
            },
        )
    }

    foodToEdit?.let { food ->
        FoodEditSheet(
            foodId = food.id,
            onDismiss = { foodToEdit = null },
            onSaved = {
                foodToEdit = null
                viewModel.refresh()
            },
        )
    }

    if (showCreateRecipeSheet) {
        RecipeEditSheet(
            recipeId = null,
            onDismiss = { showCreateRecipeSheet = false },
            onSaved = {
                showCreateRecipeSheet = false
                viewModel.refresh()
            },
        )
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = { AppTopBar(stringResource(R.string.food_search_title), scrollBehavior) },
        floatingActionButton = {
            // A menu rather than a single action: the Foods tab is the entry
            // point for creating recipes too, matching the iOS toolbar menu.
            Box {
                FloatingActionButton(onClick = {
                    haptic(HapticFeedbackType.LongPress)
                    showCreateMenu = true
                }) {
                    Icon(Icons.Default.Add, stringResource(R.string.food_search_create))
                }
                DropdownMenu(expanded = showCreateMenu, onDismissRequest = { showCreateMenu = false }) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.food_search_create_food)) },
                        leadingIcon = { Icon(Icons.Default.Restaurant, null) },
                        onClick = {
                            showCreateMenu = false
                            showCreateFoodSheet = true
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.food_search_create_recipe)) },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.MenuBook, null) },
                        onClick = {
                            showCreateMenu = false
                            showCreateRecipeSheet = true
                        },
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                viewModel.refresh()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                Spacer(modifier = Modifier.height(8.dp))

                SearchBar(
                    inputField = {
                        SearchBarDefaults.InputField(
                            query = query,
                            onQueryChange = { viewModel.updateQuery(it) },
                            onSearch = {},
                            expanded = false,
                            onExpandedChange = {},
                            placeholder = { Text(stringResource(R.string.food_search_placeholder)) },
                            leadingIcon = { Icon(Icons.Default.Search, stringResource(R.string.food_search_icon_desc)) },
                        )
                    },
                    expanded = false,
                    onExpandedChange = {},
                    modifier = Modifier.fillMaxWidth(),
                ) {}

                if (query.length >= 2) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Crossfade(targetState = isSearching, label = "search") { searching ->
                        if (searching) {
                            FoodSearchSkeleton()
                        } else if (searchResults.isEmpty() && offResults.isEmpty() && !isSearchingOff) {
                            EmptyState(stringResource(R.string.food_search_no_results, query))
                        } else {
                            LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp)) {
                                items(searchResults, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
                                        onEdit = { foodToEdit = food },
                                        onToggleFavorite = { viewModel.toggleFavorite(food) },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                                // An Open Food Facts hit is copied into the user's database on
                                // tap and then opened like any own food, mirroring the scanner.
                                openFoodFactsSection(
                                    products = offResults,
                                    isLoading = isSearchingOff,
                                    enabled = !isResolvingOff,
                                    onSelect = { product ->
                                        viewModel.selectOffProduct(product) { food ->
                                            navController.navigate("food/${food.id}")
                                        }
                                    },
                                )
                            }
                        }
                    }
                } else {
                    Spacer(modifier = Modifier.height(8.dp))
                    val tabLabels = listOf(stringResource(R.string.food_search_tab_recent), stringResource(R.string.food_search_tab_all))
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

                    Spacer(modifier = Modifier.height(8.dp))

                    val allFoodsListState = rememberLazyListState()

                    LaunchedEffect(allFoodsListState) {
                        snapshotFlow { allFoodsListState.layoutInfo }
                            .map { it.visibleItemsInfo.lastOrNull()?.index to it.totalItemsCount }
                            .distinctUntilChanged()
                            .collect { (lastVisible, total) ->
                                if (lastVisible != null && lastVisible >= total - 5) {
                                    viewModel.loadMoreFoods()
                                }
                            }
                    }

                    if (selectedTab == 0) {
                        if (recentFoods.isEmpty()) {
                            EmptyState(stringResource(R.string.food_search_no_recent))
                        } else {
                            LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp)) {
                                items(recentFoods, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
                                        onEdit = { foodToEdit = food },
                                        onToggleFavorite = { viewModel.toggleFavorite(food) },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                            }
                        }
                    } else {
                        if (allFoods.isEmpty() && !isLoadingMore) {
                            EmptyState(stringResource(R.string.food_search_no_foods))
                        } else {
                            LazyColumn(state = allFoodsListState, contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp)) {
                                items(allFoods, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
                                        onEdit = { foodToEdit = food },
                                        onToggleFavorite = { viewModel.toggleFavorite(food) },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                                if (isLoadingMore) {
                                    item {
                                        Box(
                                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FoodListItem(
    food: Food,
    onClick: () -> Unit,
    onQuickLog: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onToggleFavorite: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    // Long-press opens a named menu rather than jumping straight into editing,
    // so tap (log) and long-press (manage) are both discoverable.
    var showMenu by remember { mutableStateOf(false) }

    ListItem(
        headlineContent = { Text(food.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent =
            food.imageUrl?.let { url ->
                {
                    FoodImage(
                        imageUrl = url,
                        contentDescription = food.name,
                        modifier =
                            Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(8.dp)),
                    )
                }
            },
        supportingContent = {
            Text(
                stringResource(
                    R.string.food_search_item_summary,
                    food.calories.roundToInt(),
                    stringResource(R.string.macro_chip_protein),
                    food.protein.roundToInt(),
                    stringResource(R.string.macro_chip_carbs),
                    food.carbs.roundToInt(),
                    stringResource(R.string.macro_chip_fat),
                    food.fat.roundToInt(),
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                food.brand?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.width(8.dp))
                }
                if (onQuickLog != null) {
                    IconButton(onClick = onQuickLog) {
                        Icon(Icons.Default.Add, stringResource(R.string.food_search_quick_log), tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        },
        modifier =
            modifier.combinedClickable(
                onClick = onClick,
                onLongClick =
                    if (onEdit != null || onToggleFavorite != null) {
                        { showMenu = true }
                    } else {
                        null
                    },
            ),
    )

    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
        if (onQuickLog != null) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.food_detail_log)) },
                leadingIcon = { Icon(Icons.Default.Add, null) },
                onClick = {
                    showMenu = false
                    onQuickLog()
                },
            )
        }
        if (onEdit != null) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.food_search_edit_food)) },
                leadingIcon = { Icon(Icons.Default.Edit, null) },
                onClick = {
                    showMenu = false
                    onEdit()
                },
            )
        }
        if (onToggleFavorite != null) {
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (food.isFavorite) {
                                R.string.food_search_remove_from_favorites
                            } else {
                                R.string.food_search_add_to_favorites
                            },
                        ),
                    )
                },
                leadingIcon = {
                    Icon(if (food.isFavorite) Icons.Default.StarBorder else Icons.Default.Star, null)
                },
                onClick = {
                    showMenu = false
                    onToggleFavorite()
                },
            )
        }
    }
}
