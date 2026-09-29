package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.api.generated.model.RecipeStep
import com.bissbilanz.model.Recipe
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.util.toDisplayString
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/**
 * Set on the recipe detail's saved state when the user taps "Log this recipe" on the
 * last cooking page, so the detail screen opens its existing log sheet.
 */
const val NAV_KEY_LOG_RECIPE_AFTER_COOKING = "log_recipe_after_cooking"

/**
 * Full-screen cooking mode: one pager page for the ingredient checklist, one per step
 * (large photo and text), and a closing page. The screen stays on while it is open.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeCookScreen(
    recipeId: String,
    navController: NavController,
) {
    val recipeRepo: RecipeRepository = koinInject()
    val foodRepo: FoodRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    var recipe by remember { mutableStateOf<Recipe?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var foodNames by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    // Ingredient positions ticked off, saved so a rotation does not clear the checklist.
    var checked by rememberSaveable { mutableStateOf<List<Int>>(emptyList()) }

    // Cooking happens in the kitchen, not necessarily in range: show the cached copy
    // immediately and swap in the fresh one if the network answers.
    LaunchedEffect(recipeId) {
        val cached = withContext(Dispatchers.IO) { recipeRepo.getRecipeCached(recipeId) }
        if (cached != null) recipe = cached
        isLoading = false
        try {
            recipe = recipeRepo.getRecipe(recipeId)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            // With a cached copy on screen the user can cook regardless; only a recipe
            // that could not be loaded at all is worth reporting.
            if (recipe == null) errorReporter.captureException(e)
        }
    }

    LaunchedEffect(recipe?.ingredients) {
        val resolved = mutableMapOf<String, String>()
        for (id in recipe
            ?.ingredients
            ?.map { it.foodId }
            ?.distinct()
            .orEmpty()) {
            val food =
                foodRepo.getFoodCached(id) ?: try {
                    foodRepo.getFood(id)
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                    null
                }
            if (food != null) resolved[id] = food.name
        }
        foodNames = resolved
    }

    val view = LocalView.current
    DisposableEffect(view) {
        val previous = view.keepScreenOn
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = previous }
    }

    val steps = recipe?.steps.orEmpty().sortedBy { it.sortOrder }
    // Pages: 0 = ingredients, 1..n = steps, n + 1 = finished.
    val pageCount = steps.size + 2
    val pagerState = rememberPagerState { pageCount }
    val page = pagerState.currentPage

    fun goTo(target: Int) {
        scope.launch { pagerState.animateScrollToPage(target.coerceIn(0, pageCount - 1)) }
    }

    fun close() {
        navController.popBackStack()
    }

    fun logRecipe() {
        navController.previousBackStackEntry?.savedStateHandle?.set(NAV_KEY_LOG_RECIPE_AFTER_COOKING, true)
        navController.popBackStack()
    }

    val title =
        when {
            page == 0 -> stringResource(R.string.recipe_cook_ingredients)
            page <= steps.size -> stringResource(R.string.recipe_cook_step_of, page, steps.size)
            else -> stringResource(R.string.recipe_cook_finished_title)
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        recipe?.name?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            title,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { close() }) {
                        Icon(Icons.Default.Close, stringResource(R.string.recipe_cook_close))
                    }
                },
            )
        },
        bottomBar = {
            if (steps.isNotEmpty()) {
                Surface(tonalElevation = 3.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OutlinedButton(
                            onClick = { goTo(page - 1) },
                            enabled = page > 0,
                            modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null)
                            Text(stringResource(R.string.recipe_cook_back))
                        }
                        if (page < pageCount - 1) {
                            Button(
                                onClick = { goTo(page + 1) },
                                modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                            ) {
                                Text(stringResource(R.string.recipe_cook_next))
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null)
                            }
                        } else {
                            Button(
                                onClick = { close() },
                                modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                            ) {
                                Text(stringResource(R.string.recipe_cook_done))
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        when {
            isLoading -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding)) { LoadingScreen() }
            }

            steps.isEmpty() -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        stringResource(R.string.recipe_cook_no_steps),
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.size(16.dp))
                    OutlinedButton(onClick = { close() }) { Text(stringResource(R.string.recipe_cook_close)) }
                }
            }

            else -> {
                Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                    PageIndicator(current = page, total = pageCount)
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        key = { it },
                    ) { index ->
                        when {
                            index == 0 -> {
                                IngredientsPage(
                                    recipe = recipe,
                                    foodNames = foodNames,
                                    checked = checked,
                                    onToggle = { position, isChecked ->
                                        checked = if (isChecked) checked + position else checked - position
                                    },
                                )
                            }

                            index <= steps.size -> {
                                StepPage(number = index, step = steps[index - 1])
                            }

                            else -> {
                                FinishedPage(onLog = { logRecipe() })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PageIndicator(
    current: Int,
    total: Int,
) {
    val description = stringResource(R.string.recipe_cook_page_indicator, current + 1, total)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(total) { index ->
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(
                            if (index <= current) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            },
                        ),
            )
        }
    }
}

@Composable
private fun IngredientsPage(
    recipe: Recipe?,
    foodNames: Map<String, String>,
    checked: List<Int>,
    onToggle: (Int, Boolean) -> Unit,
) {
    val unknownFood = stringResource(R.string.food_detail_default_title)
    val ingredients = recipe?.ingredients.orEmpty().sortedBy { it.sortOrder }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        recipe?.let {
            Text(
                stringResource(R.string.recipe_cook_servings, it.totalServings.toInt()),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            stringResource(R.string.recipe_cook_ingredients_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )
        ingredients.forEachIndexed { position, ingredient ->
            val isChecked = position in checked
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .toggleable(
                            value = isChecked,
                            role = Role.Checkbox,
                            onValueChange = { onToggle(position, it) },
                        ).padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = isChecked, onCheckedChange = null)
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        foodNames[ingredient.foodId] ?: unknownFood,
                        style = MaterialTheme.typography.titleMedium,
                        textDecoration = if (isChecked) TextDecoration.LineThrough else null,
                        color =
                            if (isChecked) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                    )
                    Text(
                        "${ingredient.quantity.toDisplayString()} ${ingredient.servingUnit.value}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun StepPage(
    number: Int,
    step: RecipeStep,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(PaddingValues(horizontal = 20.dp, vertical = 12.dp)),
    ) {
        step.imageUrl?.let { url ->
            FoodImage(
                imageUrl = url,
                contentDescription = stringResource(R.string.recipe_cook_step_photo, number),
                contentScale = ContentScale.Fit,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = 320.dp)
                        .clip(RoundedCornerShape(16.dp)),
            )
            Spacer(modifier = Modifier.size(20.dp))
        }
        Text(
            step.text,
            style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp, lineHeight = 38.sp),
        )
    }
}

@Composable
private fun FinishedPage(onLog: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(72.dp),
        )
        Spacer(modifier = Modifier.size(16.dp))
        Text(
            stringResource(R.string.recipe_cook_finished_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            stringResource(R.string.recipe_cook_finished_text),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.size(24.dp))
        Button(onClick = onLog, modifier = Modifier.heightIn(min = 56.dp)) {
            Icon(Icons.Default.Add, null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.recipe_cook_log))
        }
    }
}
