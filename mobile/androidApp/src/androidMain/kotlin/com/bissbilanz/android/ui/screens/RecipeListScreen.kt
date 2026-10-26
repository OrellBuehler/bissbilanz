package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.ChoiceDropdown
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerMacros
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.android.ui.components.rememberJsonStateSaver
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.util.formatLocalizedNumber
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
    var recipeToLog by rememberSaveable(stateSaver = rememberJsonStateSaver<Recipe>()) { mutableStateOf<Recipe?>(null) }
    var showCreateSheet by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var sortBy by rememberSaveable { mutableStateOf(RecipeSort.NAME) }
    var isDuplicating by remember { mutableStateOf(false) }
    val loadFailedMessage = stringResource(R.string.recipe_list_load_failed)
    val loggedMessageTemplate = stringResource(R.string.food_detail_logged)
    val logFailedMessage = stringResource(R.string.recipe_list_log_failed)
    val duplicateFailedMessage = stringResource(R.string.recipe_list_duplicate_failed)
    val copyNameTemplate = stringResource(R.string.recipe_copy_name_format)

    // Name matches first, then recipes carrying the query as a label; null while the query is blank.
    val matchedIds by produceState<Set<String>?>(null, query, recipes) {
        value = if (query.isBlank()) null else recipeRepo.searchRecipes(query).map { it.id }.toSet()
    }
    val visibleRecipes =
        remember(recipes, matchedIds, sortBy) {
            recipes
                .filter { matchedIds?.contains(it.id) ?: true }
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
        if (isDuplicating) return
        isDuplicating = true
        scope.launch {
            try {
                val copy = recipeRepo.duplicateRecipe(recipe.id, String.format(copyNameTemplate, recipe.name))
                navController.navigate("recipe/${copy.id}")
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                snackbarHostState.showSnackbar(duplicateFailedMessage)
            }
            isDuplicating = false
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

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            AppTopBar(
                scrollBehavior = scrollBehavior,
                title = stringResource(R.string.recipe_list_title),
                onBack = { navController.popBackStack() },
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
            // The cached list stays on screen while it refreshes; the spinner is for a first load only.
            Crossfade(targetState = isLoading && recipes.isEmpty(), label = "recipes") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (recipes.isEmpty()) {
                    EmptyState(stringResource(R.string.recipe_list_empty))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding =
                            PaddingValues(
                                start = Dimens.ScreenPadding,
                                top = Dimens.ListGap,
                                end = Dimens.ScreenPadding,
                                bottom = Dimens.FabClearance,
                            ),
                    ) {
                        item(key = "recipe-search-sort") {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedTextField(
                                    value = query,
                                    onValueChange = { query = it },
                                    placeholder = { Text(stringResource(R.string.recipe_list_search_placeholder)) },
                                    leadingIcon = { Icon(Icons.Default.Search, null) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                val sortOptions = RecipeSort.entries.map { stringResource(it.labelRes) to it }
                                ChoiceDropdown(
                                    selectedLabel = stringResource(sortBy.labelRes),
                                    options = sortOptions,
                                    onSelect = { sortBy = it },
                                    label = stringResource(R.string.recipe_list_sort_label),
                                )
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
                                duplicateEnabled = !isDuplicating,
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
    duplicateEnabled: Boolean = true,
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
                            .size(Dimens.ThumbCard)
                            .clip(MaterialTheme.shapes.small),
                )
                Spacer(modifier = Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(recipe.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Text(
                    stringResource(
                        R.string.recipe_list_item_summary,
                        formatLocalizedNumber(recipe.totalServings, 2),
                        recipe.ingredients.size,
                    ),
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
                IconButton(onClick = duplicate, enabled = duplicateEnabled) {
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

    // The cached recipe already carries per-serving macros.
    CALORIES(R.string.recipe_list_sort_calories, compareBy { it.calories }),
}
