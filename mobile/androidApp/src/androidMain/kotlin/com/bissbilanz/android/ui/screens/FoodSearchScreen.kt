package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.FoodSearchSkeleton
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.model.Food
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import org.koin.core.qualifier.named
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodSearchScreen(navController: NavController) {
    val viewModel: FoodSearchViewModel = koinViewModel()
    val baseUrl: String = koinInject(named("baseUrl"))
    val refreshManager: RefreshManager = koinInject()
    val recentFoods by viewModel.recentFoods.collectAsStateWithLifecycle()
    val allFoods by viewModel.allFoods.collectAsStateWithLifecycle()
    val isLoadingMore by viewModel.isLoadingMore.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    var foodToLog by remember { mutableStateOf<Food?>(null) }
    var showCreateFoodSheet by remember { mutableStateOf(false) }

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

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = {
                haptic(HapticFeedbackType.LongPress)
                showCreateFoodSheet = true
            }) {
                Icon(Icons.Default.Add, "Create food")
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
                            placeholder = { Text("Search foods...") },
                            leadingIcon = { Icon(Icons.Default.Search, "Search") },
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
                        } else if (searchResults.isEmpty()) {
                            EmptyState("No foods found for \"$query\"")
                        } else {
                            LazyColumn {
                                items(searchResults, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        baseUrl = baseUrl,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Spacer(modifier = Modifier.height(8.dp))
                    val tabLabels = listOf("Recent", "All")
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
                            EmptyState("No recent foods")
                        } else {
                            LazyColumn {
                                items(recentFoods, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        baseUrl = baseUrl,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
                                        modifier = Modifier.animateItem(),
                                    )
                                }
                            }
                        }
                    } else {
                        if (allFoods.isEmpty() && !isLoadingMore) {
                            EmptyState("No foods yet")
                        } else {
                            LazyColumn(state = allFoodsListState) {
                                items(allFoods, key = { it.id }) { food ->
                                    FoodListItem(
                                        food = food,
                                        baseUrl = baseUrl,
                                        onClick = { navController.navigate("food/${food.id}") },
                                        onQuickLog = {
                                            haptic(HapticFeedbackType.LongPress)
                                            foodToLog = food
                                        },
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

@Composable
fun FoodListItem(
    food: Food,
    baseUrl: String,
    onClick: () -> Unit,
    onQuickLog: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    ListItem(
        headlineContent = { Text(food.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent =
            food.imageUrl?.let { url ->
                {
                    val imageUrl = if (url.startsWith("/")) "$baseUrl$url" else url
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = food.name,
                        modifier =
                            Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop,
                    )
                }
            },
        supportingContent = {
            Text(
                "${food.calories.roundToInt()} cal  ·  P${food.protein.roundToInt()} C${food.carbs.roundToInt()} F${food.fat.roundToInt()}",
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
                        Icon(Icons.Default.Add, "Quick log", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        },
        modifier = modifier.clickable(onClick = onClick),
    )
}
