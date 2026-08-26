package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
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
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val recipes by recipeRepo.allRecipes().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var recipeToLog by remember { mutableStateOf<Recipe?>(null) }
    var showCreateSheet by remember { mutableStateOf(false) }
    val loadFailedMessage = stringResource(R.string.recipe_list_load_failed)
    val loggedMessageTemplate = stringResource(R.string.food_detail_logged)
    val logFailedMessage = stringResource(R.string.recipe_list_log_failed)

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

    if (recipeToLog != null) {
        MealPickerSheet(
            onDismiss = { recipeToLog = null },
            onConfirm = { meal, servings ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        entryRepo.createEntry(
                            EntryCreate(recipeId = recipeToLog!!.id, mealType = meal, servings = servings, date = today),
                            recipe = recipeToLog,
                        )
                        snackbarHostState.showSnackbar(String.format(loggedMessageTemplate, recipeToLog!!.name))
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(logFailedMessage)
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
                        items(recipes, key = { it.id }) { recipe ->
                            RecipeListItem(
                                recipe = recipe,
                                onClick = { navController.navigate("recipe/${recipe.id}") },
                                onQuickLog = { recipeToLog = recipe },
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
    modifier: Modifier = Modifier,
) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
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
            IconButton(onClick = onQuickLog) {
                Icon(Icons.Default.Add, stringResource(R.string.recipe_list_log_content_desc), tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
