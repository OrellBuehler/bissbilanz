package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeListScreen(navController: NavController) {
    val recipeRepo: RecipeRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val recipes by recipeRepo.allRecipes().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var recipeToLog by remember { mutableStateOf<Recipe?>(null) }
    var showCreateSheet by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            recipeRepo.refresh()
        } catch (_: Exception) {
        }
        isLoading = false
    }

    if (recipeToLog != null) {
        MealPickerSheet(
            onDismiss = { recipeToLog = null },
            onConfirm = { meal, servings ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        entryRepo.createEntry(EntryCreate(recipeId = recipeToLog!!.id, mealType = meal, servings = servings, date = today))
                        snackbarHostState.showSnackbar("Logged ${recipeToLog!!.name}")
                    } catch (_: Exception) {
                        snackbarHostState.showSnackbar("Failed to log recipe")
                    }
                }
                recipeToLog = null
            },
        )
    }

    if (showCreateSheet) {
        RecipeEditSheet(
            recipeId = null,
            onDismiss = { showCreateSheet = false },
            onSaved = {
                showCreateSheet = false
                scope.launch { recipeRepo.refresh() }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recipes") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateSheet = true }) {
                Icon(Icons.Default.Add, "Create recipe")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Crossfade(targetState = isLoading, label = "recipes") { loading ->
            if (loading) {
                LoadingScreen()
            } else if (recipes.isEmpty()) {
                EmptyState("No recipes yet.\nTap + to create one.")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(recipes) { recipe ->
                        RecipeListItem(
                            recipe = recipe,
                            onClick = { navController.navigate("recipe/${recipe.id}") },
                            onQuickLog = { recipeToLog = recipe },
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun RecipeListItem(
    recipe: Recipe,
    onClick: () -> Unit,
    onQuickLog: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(recipe.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Text(
                    "${recipe.totalServings.toInt()} servings  ·  ${recipe.ingredients?.size ?: 0} ingredients",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (recipe.isFavorite) {
                    Text("Favorite", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
            IconButton(onClick = onQuickLog) {
                Icon(Icons.Default.Add, "Log recipe", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
