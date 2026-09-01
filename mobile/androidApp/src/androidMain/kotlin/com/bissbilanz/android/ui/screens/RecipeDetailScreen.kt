package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.toDisplayString
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject
import kotlin.time.Clock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeDetailScreen(
    recipeId: String,
    navController: NavController,
) {
    val recipeRepo: RecipeRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var recipe by remember { mutableStateOf<Recipe?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var showLogDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showEditSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val loadFailedMessage = stringResource(R.string.recipe_detail_load_failed)
    val refreshFailedMessage = stringResource(R.string.recipe_detail_refresh_failed)
    val loggedMessageTemplate = stringResource(R.string.food_detail_logged)
    val logFailedMessage = stringResource(R.string.recipe_list_log_failed)
    val deleteFailedMessage = stringResource(R.string.recipe_detail_delete_failed)

    LaunchedEffect(recipeId) {
        isLoading = true
        try {
            recipe = recipeRepo.getRecipe(recipeId)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar(loadFailedMessage)
        }
        isLoading = false
    }

    if (showEditSheet) {
        RecipeEditSheet(
            recipeId = recipeId,
            onDismiss = { showEditSheet = false },
            onSaved = {
                showEditSheet = false
                scope.launch {
                    try {
                        recipe = recipeRepo.getRecipe(recipeId)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(refreshFailedMessage)
                    }
                }
            },
        )
    }

    if (showLogDialog && recipe != null) {
        MealPickerSheet(
            onDismiss = { showLogDialog = false },
            onConfirm = { meal, servings ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        entryRepo.createEntry(
                            EntryCreate(recipeId = recipe!!.id, mealType = meal, servings = servings, date = today),
                            recipe = recipe,
                        )
                        snackbarHostState.showSnackbar(String.format(loggedMessageTemplate, recipe!!.name))
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(logFailedMessage)
                    }
                }
                showLogDialog = false
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.recipe_detail_delete_title)) },
            text = { Text(stringResource(R.string.recipe_detail_delete_text, recipe?.name ?: "")) },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                recipeRepo.deleteRecipe(recipeId)
                                navController.popBackStack()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                snackbarHostState.showSnackbar(deleteFailedMessage)
                            }
                        }
                        showDeleteDialog = false
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(recipe?.name ?: stringResource(R.string.recipe_detail_default_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (recipe != null) {
                        IconButton(onClick = { showEditSheet = true }) {
                            Icon(Icons.Default.Edit, stringResource(R.string.action_edit))
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, stringResource(R.string.action_delete), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (recipe != null) {
                ExtendedFloatingActionButton(
                    onClick = { showLogDialog = true },
                    icon = { Icon(Icons.Default.Add, stringResource(R.string.food_detail_log)) },
                    text = { Text(stringResource(R.string.recipe_detail_log_recipe)) },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (isLoading) {
            LoadingScreen()
        } else {
            PullToRefreshWrapper(
                onRefresh = {
                    refreshManager.refreshAll()
                    try {
                        recipe = recipeRepo.getRecipe(recipeId)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(refreshFailedMessage)
                    }
                },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                recipe?.let { r ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(16.dp),
                    ) {
                        Text(
                            stringResource(R.string.recipe_detail_servings, r.totalServings.toInt()),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        val ingredients = r.ingredients
                        if (ingredients.isNotEmpty()) {
                            // Ingredients list
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        stringResource(R.string.food_detail_ingredients),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    ingredients.sortedBy { it.sortOrder }.forEach { ing ->
                                        val qty = ing.quantity.toDisplayString()
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Text(ing.foodId, modifier = Modifier.weight(1f))
                                            Text(
                                                "$qty ${ing.servingUnit.value}",
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        if (ing != ingredients.last()) {
                                            HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(80.dp))
                    }
                }
            }
        }
    }
}
