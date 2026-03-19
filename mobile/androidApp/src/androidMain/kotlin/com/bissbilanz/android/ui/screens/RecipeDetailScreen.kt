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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
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
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

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

    LaunchedEffect(recipeId) {
        isLoading = true
        try {
            recipe = recipeRepo.getRecipe(recipeId)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar("Failed to load recipe")
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
                        snackbarHostState.showSnackbar("Failed to refresh recipe")
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
                        snackbarHostState.showSnackbar("Logged ${recipe!!.name}")
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar("Failed to log recipe")
                    }
                }
                showLogDialog = false
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Recipe") },
            text = { Text("Are you sure you want to delete \"${recipe?.name}\"?") },
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
                                snackbarHostState.showSnackbar("Failed to delete recipe")
                            }
                        }
                        showDeleteDialog = false
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(recipe?.name ?: "Recipe") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (recipe != null) {
                        IconButton(onClick = { showEditSheet = true }) {
                            Icon(Icons.Default.Edit, "Edit")
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (recipe != null) {
                ExtendedFloatingActionButton(
                    onClick = { showLogDialog = true },
                    icon = { Icon(Icons.Default.Add, "Log") },
                    text = { Text("Log recipe") },
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
                        snackbarHostState.showSnackbar("Failed to refresh recipe")
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
                            "${r.totalServings.toInt()} servings",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        val ingredients = r.ingredients
                        if (ingredients.isNotEmpty()) {
                            // Ingredients list
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text("Ingredients", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
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
