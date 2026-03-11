package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.model.Food
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import org.koin.core.qualifier.named

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodSearchScreen(navController: NavController) {
    val viewModel: FoodSearchViewModel = koinViewModel()
    val baseUrl: String = koinInject(named("baseUrl"))
    val recentFoods by viewModel.recentFoods.collectAsStateWithLifecycle()
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
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
            FloatingActionButton(onClick = { showCreateFoodSheet = true }) {
                Icon(Icons.Default.Add, "Create food")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
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
                if (isSearching) {
                    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (searchResults.isEmpty()) {
                    EmptyState("No foods found for \"$query\"")
                } else {
                    LazyColumn {
                        items(searchResults) { food ->
                            FoodListItem(
                                food = food,
                                baseUrl = baseUrl,
                                onClick = { navController.navigate("food/${food.id}") },
                                onQuickLog = { foodToLog = food },
                            )
                        }
                    }
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                TabRow(selectedTabIndex = selectedTab) {
                    Tab(selected = selectedTab == 0, onClick = { viewModel.selectTab(0) }, text = { Text("Recent") })
                    Tab(selected = selectedTab == 1, onClick = { viewModel.selectTab(1) }, text = { Text("Favorites") })
                }

                Spacer(modifier = Modifier.height(8.dp))

                val displayFoods = if (selectedTab == 0) recentFoods else favorites

                if (displayFoods.isEmpty()) {
                    EmptyState(if (selectedTab == 0) "No recent foods" else "No favorites yet")
                } else {
                    LazyColumn {
                        items(displayFoods) { food ->
                            FoodListItem(
                                food = food,
                                baseUrl = baseUrl,
                                onClick = { navController.navigate("food/${food.id}") },
                                onQuickLog = { foodToLog = food },
                            )
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
    baseUrl: String = "",
    onClick: () -> Unit,
    onQuickLog: (() -> Unit)? = null,
) {
    ListItem(
        headlineContent = { Text(food.name) },
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
                "${food.calories.toInt()} cal  ·  P${food.protein.toInt()} C${food.carbs.toInt()} F${food.fat.toInt()}",
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
        modifier = Modifier.clickable(onClick = onClick),
    )
}
