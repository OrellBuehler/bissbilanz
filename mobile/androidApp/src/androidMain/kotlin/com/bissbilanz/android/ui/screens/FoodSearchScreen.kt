package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.model.Food
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodSearchScreen(navController: NavController) {
    val foodRepo: FoodRepository = koinInject()
    val recentFoods by foodRepo.recentFoods.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<Food>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        foodRepo.loadRecentFoods()
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        SearchBar(
            inputField = {
                SearchBarDefaults.InputField(
                    query = query,
                    onQueryChange = {
                        query = it
                        scope.launch {
                            searchResults = if (it.length >= 2) foodRepo.searchFoods(it) else emptyList()
                        }
                    },
                    onSearch = {},
                    expanded = false,
                    onExpandedChange = {},
                    placeholder = { Text("Search foods...") },
                    leadingIcon = { Icon(Icons.Default.Search, "Search") }
                )
            },
            expanded = false,
            onExpandedChange = {},
            modifier = Modifier.fillMaxWidth()
        ) {}

        Spacer(modifier = Modifier.height(16.dp))

        val displayFoods = if (query.length >= 2) searchResults else recentFoods

        if (query.length < 2) {
            Text("Recent", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(8.dp))
        }

        LazyColumn {
            items(displayFoods) { food ->
                FoodListItem(food) { navController.navigate("food/${food.id}") }
            }
        }
    }
}

@Composable
fun FoodListItem(food: Food, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(food.name) },
        supportingContent = {
            Text(
                "${food.calories.toInt()} cal · P${food.protein.toInt()} C${food.carbs.toInt()} F${food.fat.toInt()}",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingContent = {
            food.brand?.let { Text(it, style = MaterialTheme.typography.labelSmall) }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}
