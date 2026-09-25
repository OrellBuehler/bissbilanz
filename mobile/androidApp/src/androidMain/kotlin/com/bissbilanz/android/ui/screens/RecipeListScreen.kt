package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerMacros
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.cookedWeightServingSize
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeListScreen(navController: NavController) {
    val recipeRepo: RecipeRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val recipes by recipeRepo.allRecipes().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var recipeToLog by remember { mutableStateOf<Recipe?>(null) }
    var showCreateSheet by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var sortBy by remember { mutableStateOf(RecipeSort.NAME) }
    var showSortMenu by remember { mutableStateOf(false) }
    val loadFailedMessage = stringResource(R.string.recipe_list_load_failed)
    val loggedMessageTemplate = stringResource(R.string.food_detail_logged)
    val logFailedMessage = stringResource(R.string.recipe_list_log_failed)
    val duplicateFailedMessage = stringResource(R.string.recipe_list_duplicate_failed)
    val copyNameTemplate = stringResource(R.string.recipe_copy_name_format)

    val visibleRecipes =
        remember(recipes, query, sortBy) {
            recipes
                .filter { it.name.contains(query, ignoreCase = true) }
                .sortedWith(sortBy.comparator)
        }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            recipeRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar(loadFailedMessage)
        }
        isLoading = false
    }

    recipeToLog?.let { recipe ->
        MealPickerSheet(
            onDismiss = { recipeToLog = null },
            onConfirm = { details ->
                scope.launch {
                    try {
                        entryRepo.createEntry(
                            EntryCreate(
                                recipeId = recipe.id,
                                mealType = details.mealType,
                                servings = details.servings,
                                date = details.date,
                                eatenAt = details.eatenAt,
                                notes = details.notes,
                            ),
                            recipe = recipe,
                        )
                        snackbarHostState.showSnackbar(String.format(loggedMessageTemplate, recipe.name))
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(logFailedMessage)
                    }
                }
                recipeToLog = null
            },
            macros = MealPickerMacros(recipe.calories, recipe.protein, recipe.carbs, recipe.fat, recipe.fiber),
            imageUrl = recipe.imageUrl,
            gramsPerServing = cookedWeightServingSize(recipe.cookedWeight, recipe.totalServings),
        )
    }

    fun duplicateRecipe(recipe: Recipe) {
        scope.launch {
            try {
                val copy = recipeRepo.duplicateRecipe(recipe.id, String.format(copyNameTemplate, recipe.name))
                navController.navigate("recipe/${copy.id}")
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                snackbarHostState.showSnackbar(duplicateFailedMessage)
            }
        }
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
                title = { Text(stringResource(R.string.recipe_list_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateSheet = true }) {
                Icon(Icons.Default.Add, stringResource(R.string.recipe_list_create))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = { refreshManager.refreshAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading, label = "recipes") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (recipes.isEmpty()) {
                    EmptyState(stringResource(R.string.recipe_list_empty))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp),
                    ) {
                        item(key = "recipe-search-sort") {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedTextField(
                                    value = query,
                                    onValueChange = { query = it },
                                    placeholder = { Text(stringResource(R.string.recipe_list_search_placeholder)) },
                                    leadingIcon = { Icon(Icons.Default.Search, null) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                ExposedDropdownMenuBox(
                                    expanded = showSortMenu,
                                    onExpandedChange = { showSortMenu = it },
                                ) {
                                    OutlinedTextField(
                                        value = stringResource(sortBy.labelRes),
                                        onValueChange = {},
                                        readOnly = true,
                                        trailingIcon = {
                                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = showSortMenu)
                                        },
                                        modifier =
                                            Modifier
                                                .width(150.dp)
                                                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
                                        singleLine = true,
                                    )
                                    ExposedDropdownMenu(
                                        expanded = showSortMenu,
                                        onDismissRequest = { showSortMenu = false },
                                    ) {
                                        RecipeSort.entries.forEach { option ->
                                            DropdownMenuItem(
                                                text = { Text(stringResource(option.labelRes)) },
                                                onClick = {
                                                    sortBy = option
                                                    showSortMenu = false
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        if (visibleRecipes.isEmpty()) {
                            item(key = "recipe-no-results") {
                                EmptyState(stringResource(R.string.recipe_list_no_results))
                            }
                        }
                        items(visibleRecipes, key = { it.id }) { recipe ->
                            RecipeListItem(
                                recipe = recipe,
                                onClick = { navController.navigate("recipe/${recipe.id}") },
                                onQuickLog = { recipeToLog = recipe },
                                onDuplicate = { duplicateRecipe(recipe) },
                                modifier = Modifier.animateItem(),
                            )
                        }
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
    onDuplicate: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            recipe.imageUrl?.let { url ->
                FoodImage(
                    imageUrl = url,
                    contentDescription = recipe.name,
                    modifier =
                        Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(8.dp)),
                )
                Spacer(modifier = Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(recipe.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Text(
                    stringResource(R.string.recipe_list_item_summary, recipe.totalServings.toInt(), recipe.ingredients?.size ?: 0),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (recipe.isFavorite) {
                    Text(
                        stringResource(R.string.action_favorite),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            onDuplicate?.let { duplicate ->
                IconButton(onClick = duplicate) {
                    Icon(Icons.Default.ContentCopy, stringResource(R.string.recipe_list_duplicate))
                }
            }
            IconButton(onClick = onQuickLog) {
                Icon(Icons.Default.Add, stringResource(R.string.recipe_list_log_content_desc), tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

private enum class RecipeSort(
    val labelRes: Int,
    val comparator: Comparator<Recipe>,
) {
    NAME(R.string.recipe_list_sort_name, compareBy { it.name.lowercase() }),
    RECENT(
        R.string.recipe_list_sort_recent,
        compareByDescending { it.updatedAt ?: it.createdAt ?: "" },
    ),
    CALORIES(
        R.string.recipe_list_sort_calories,
        compareBy { it.calories / it.totalServings.coerceAtLeast(1.0) },
    ),
}
