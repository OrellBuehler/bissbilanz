package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.MealPickerDialog
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodSearchScreen(navController: NavController) {
    val foodRepo: FoodRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val recentFoods by foodRepo.recentFoods.collectAsStateWithLifecycle()
    val favorites by foodRepo.favorites.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<Food>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var foodToLog by remember { mutableStateOf<Food?>(null) }

    LaunchedEffect(Unit) {
        foodRepo.loadRecentFoods()
        foodRepo.loadFavorites()
    }

    if (foodToLog != null) {
        MealPickerDialog(
            onDismiss = { foodToLog = null },
            onConfirm = { meal, servings ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        entryRepo.createEntry(
                            EntryCreate(
                                foodId = foodToLog!!.id,
                                mealType = meal,
                                servings = servings,
                                date = today,
                            ),
                        )
                        snackbarHostState.showSnackbar("Logged ${foodToLog!!.name}")
                    } catch (e: Exception) {
                        snackbarHostState.showSnackbar("Failed to log food")
                    }
                }
                foodToLog = null
            },
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            Spacer(modifier = Modifier.height(8.dp))

            SearchBar(
                inputField = {
                    SearchBarDefaults.InputField(
                        query = query,
                        onQueryChange = {
                            query = it
                            scope.launch {
                                if (it.length >= 2) {
                                    isSearching = true
                                    searchResults =
                                        try {
                                            foodRepo.searchFoods(it)
                                        } catch (_: Exception) {
                                            emptyList()
                                        }
                                    isSearching = false
                                } else {
                                    searchResults = emptyList()
                                }
                            }
                        },
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
                                onClick = { navController.navigate("food/${food.id}") },
                                onQuickLog = { foodToLog = food },
                            )
                        }
                    }
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                TabRow(selectedTabIndex = selectedTab) {
                    Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Recent") })
                    Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Favorites") })
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
    onClick: () -> Unit,
    onQuickLog: (() -> Unit)? = null,
) {
    ListItem(
        headlineContent = { Text(food.name) },
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
