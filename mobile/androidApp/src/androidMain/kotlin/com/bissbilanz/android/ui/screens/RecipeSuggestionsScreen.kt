package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.analytics.MacroBudget
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MacroChipRow
import com.bissbilanz.android.ui.components.MealPickerMacros
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.RecipeSuggestionsViewModel
import com.bissbilanz.android.ui.viewmodels.SuggestedRecipe
import com.bissbilanz.util.cookedWeightServingSize
import com.bissbilanz.util.formatAsInt
import com.bissbilanz.util.toDisplayString
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeSuggestionsScreen(navController: NavController) {
    val viewModel: RecipeSuggestionsViewModel = koinViewModel()
    val refreshManager: RefreshManager = koinInject()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val recipes by viewModel.recipes.collectAsStateWithLifecycle()
    val remaining by viewModel.remaining.collectAsStateWithLifecycle()
    val suggestions by viewModel.suggestions.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    var recipeToLog by remember { mutableStateOf<SuggestedRecipe?>(null) }

    val loggedFormat = stringResource(R.string.recipe_suggestions_logged)
    val logFailedMessage = stringResource(R.string.recipe_suggestions_log_failed)

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    recipeToLog?.let { suggested ->
        val recipe = suggested.recipe
        MealPickerSheet(
            onDismiss = { recipeToLog = null },
            onConfirm = { details ->
                viewModel.logRecipe(recipe, details, { name -> loggedFormat.format(name) }, logFailedMessage)
                recipeToLog = null
            },
            macros = MealPickerMacros(recipe.calories, recipe.protein, recipe.carbs, recipe.fat, recipe.fiber),
            imageUrl = recipe.imageUrl,
            initialServings = suggested.suggestion.servings,
            initialMeal = viewModel.resolveDefaultMeal(),
            gramsPerServing = cookedWeightServingSize(recipe.cookedWeight, recipe.totalServings),
        )
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = { AppTopBar(stringResource(R.string.recipe_suggestions_title), scrollBehavior) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = { refreshManager.refreshAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading, label = "recipe-suggestions") { loading ->
                when {
                    loading -> LoadingScreen()

                    goals == null ->
                        EmptyState(
                            message = stringResource(R.string.recipe_suggestions_no_goals),
                            icon = Icons.Filled.Flag,
                            action = {
                                Button(onClick = { navController.navigate("settings") }) {
                                    Text(stringResource(R.string.recipe_suggestions_set_goals))
                                }
                            },
                        )

                    recipes.isEmpty() ->
                        EmptyState(
                            message = stringResource(R.string.recipe_suggestions_no_recipes),
                            icon = Icons.AutoMirrored.Filled.MenuBook,
                            action = {
                                Button(onClick = { navController.navigate("recipes") }) {
                                    Text(stringResource(R.string.recipe_suggestions_browse_recipes))
                                }
                            },
                        )

                    suggestions.isEmpty() ->
                        EmptyState(
                            message = stringResource(R.string.recipe_suggestions_goal_reached),
                            icon = Icons.Filled.CheckCircle,
                        )

                    else ->
                        Column(
                            modifier =
                                Modifier
                                    .fillMaxSize()
                                    .verticalScroll(rememberScrollState())
                                    .padding(horizontal = 16.dp),
                        ) {
                            Spacer(modifier = Modifier.height(8.dp))
                            remaining?.let { RemainingCard(it) }
                            Spacer(modifier = Modifier.height(16.dp))
                            suggestions.forEach { suggested ->
                                SuggestionCard(suggested = suggested, onClick = { recipeToLog = suggested })
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                }
            }
        }
    }
}

@Composable
private fun RemainingCard(remaining: MacroBudget) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.recipe_suggestions_remaining_header),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            MacroRow(stringResource(R.string.macro_calories), remaining.calories, stringResource(R.string.unit_kcal), CaloriesBlue)
            MacroRow(stringResource(R.string.macro_protein), remaining.protein, "g", ProteinRed)
            MacroRow(stringResource(R.string.macro_carbs), remaining.carbs, "g", CarbsOrange)
            MacroRow(stringResource(R.string.macro_fat), remaining.fat, "g", FatYellow)
        }
    }
}

@Composable
private fun SuggestionCard(
    suggested: SuggestedRecipe,
    onClick: () -> Unit,
) {
    val recipe = suggested.recipe
    val macros = suggested.suggestion.macros
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            recipe.imageUrl?.let { url ->
                FoodImage(
                    imageUrl = url,
                    contentDescription = recipe.name,
                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)),
                )
                Spacer(modifier = Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        recipe.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.recipe_suggestions_servings_chip, suggested.suggestion.servings.toDisplayString()),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium,
                        modifier =
                            Modifier
                                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.format_kcal, macros.calories.formatAsInt()),
                        style = MaterialTheme.typography.bodyMedium,
                        color = CaloriesBlue.macroTextTone(),
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        stringResource(R.string.recipe_suggestions_fit, suggested.suggestion.fit),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                MacroChipRow(protein = macros.protein, carbs = macros.carbs, fat = macros.fat, fiber = macros.fiber)
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { (suggested.suggestion.fit / 100f).coerceIn(0f, 1f) },
                    color = CaloriesBlue,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
