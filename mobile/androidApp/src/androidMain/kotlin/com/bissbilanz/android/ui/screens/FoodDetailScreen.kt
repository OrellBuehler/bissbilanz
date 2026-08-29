package com.bissbilanz.android.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.FoodImage
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.formatNutrient
import com.bissbilanz.util.toDisplayString
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

private val NutriScoreA = Color(0xFF038141)
private val NutriScoreB = Color(0xFF85BB2F)
private val NutriScoreC = Color(0xFFFECB02)
private val NutriScoreD = Color(0xFFEE8100)
private val NutriScoreE = Color(0xFFE63E11)

private val NovaGreen = Color(0xFF038141)
private val NovaYellow = Color(0xFFFECB02)
private val NovaOrange = Color(0xFFEE8100)
private val NovaRed = Color(0xFFE63E11)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodDetailScreen(
    foodId: String,
    navController: NavController,
) {
    val foodRepo: FoodRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(null)
    val visibleNutrients = prefs?.visibleNutrients?.toSet()
    var food by remember { mutableStateOf<Food?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var showLogDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showEditSheet by remember { mutableStateOf(false) }
    var isEnriching by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val loadFailedMessage = stringResource(R.string.food_detail_load_failed)
    val logFailedMessage = stringResource(R.string.food_detail_log_failed)
    val deleteFailedMessage = stringResource(R.string.food_detail_delete_failed)
    val enrichSuccessMessage = stringResource(R.string.food_detail_enrich_success)
    val enrichFailedMessage = stringResource(R.string.food_detail_enrich_failed)
    val refreshFailedMessage = stringResource(R.string.food_detail_refresh_failed)
    val loggedMessageTemplate = stringResource(R.string.food_detail_logged)

    LaunchedEffect(foodId) {
        isLoading = true
        try {
            food = foodRepo.getFood(foodId)
            prefsRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar(loadFailedMessage)
        }
        isLoading = false
    }

    if (showLogDialog && food != null) {
        MealPickerSheet(
            onDismiss = { showLogDialog = false },
            onConfirm = { meal, servings ->
                scope.launch {
                    try {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                        entryRepo.createEntry(
                            EntryCreate(
                                foodId = food!!.id,
                                mealType = meal,
                                servings = servings,
                                date = today,
                            ),
                            food = food,
                        )
                        snackbarHostState.showSnackbar(String.format(loggedMessageTemplate, food!!.name))
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

    if (showEditSheet) {
        FoodEditSheet(
            foodId = foodId,
            onDismiss = { showEditSheet = false },
            onSaved = {
                showEditSheet = false
                food = foodRepo.getFoodCached(foodId) ?: food
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.food_detail_delete_title)) },
            text = { Text(stringResource(R.string.food_detail_delete_text, food?.name ?: "")) },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                foodRepo.deleteFood(foodId)
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
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (food?.isFavorite == true) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = stringResource(R.string.action_favorite),
                                modifier = Modifier.size(20.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                        Text(
                            food?.name ?: stringResource(R.string.food_detail_default_title),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (food != null) {
                        if (food?.barcode != null) {
                            IconButton(
                                onClick = {
                                    if (!isEnriching) {
                                        isEnriching = true
                                        scope.launch {
                                            try {
                                                food = foodRepo.enrichFood(foodId, food!!.barcode!!)
                                                snackbarHostState.showSnackbar(enrichSuccessMessage)
                                            } catch (e: Exception) {
                                                if (e is kotlinx.coroutines.CancellationException) throw e
                                                errorReporter.captureException(e)
                                                snackbarHostState.showSnackbar(enrichFailedMessage)
                                            }
                                            isEnriching = false
                                        }
                                    }
                                },
                                enabled = !isEnriching,
                            ) {
                                if (isEnriching) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                    )
                                } else {
                                    Icon(Icons.Default.AutoAwesome, stringResource(R.string.food_detail_enrich))
                                }
                            }
                        }
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
            if (food != null) {
                ExtendedFloatingActionButton(
                    onClick = { showLogDialog = true },
                    icon = { Icon(Icons.Default.Add, stringResource(R.string.food_detail_log)) },
                    text = { Text(stringResource(R.string.food_detail_log_this_food)) },
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
                        food = foodRepo.getFood(foodId)
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        errorReporter.captureException(e)
                        snackbarHostState.showSnackbar(refreshFailedMessage)
                    }
                },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                food?.let { f ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(16.dp),
                    ) {
                        f.imageUrl?.let { url ->
                            FoodImage(
                                imageUrl = url,
                                contentDescription = f.name,
                                modifier =
                                    Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 200.dp)
                                        .clip(RoundedCornerShape(12.dp)),
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                        }

                        f.brand?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(4.dp))
                        }

                        Text(
                            stringResource(
                                R.string.food_detail_serving_size,
                                f.servingSize.toDisplayString(),
                                f.servingUnit.name.lowercase(),
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        f.barcode?.let {
                            Text(
                                stringResource(R.string.scan_barcode_value, it),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Main macros card
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    stringResource(R.string.food_form_macros),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                MacroRow(stringResource(R.string.macro_calories), f.calories, "kcal", CaloriesBlue)
                                MacroRow(stringResource(R.string.macro_protein), f.protein, "g", ProteinRed)
                                MacroRow(stringResource(R.string.macro_carbs), f.carbs, "g", CarbsOrange)
                                MacroRow(stringResource(R.string.macro_fat), f.fat, "g", FatYellow)
                                MacroRow(stringResource(R.string.macro_fiber), f.fiber, "g", FiberGreen)
                            }
                        }

                        ExtendedNutrientSections(food = f, visibleNutrients = visibleNutrients)

                        // Food Quality
                        FoodQualityCard(f)

                        Spacer(modifier = Modifier.height(80.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun NutrientCategoryCard(
    title: String,
    nutrients: List<Pair<String, Pair<Double, String>>>,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
            nutrients.forEach { (label, valueUnit) ->
                MacroRow(label, valueUnit.first, valueUnit.second)
            }
        }
    }
}

/**
 * Renders the extended-nutrient category cards (fat breakdown, sugars & carbs, minerals,
 * vitamins, other) for a [food]. Values are multiplied by [servings] (1.0 = per single
 * serving). When [visibleNutrients] is non-null, only nutrients whose key is in the set are
 * shown; null shows every nutrient the food has. Empty categories are omitted.
 */
@Composable
fun ExtendedNutrientSections(
    food: Food,
    visibleNutrients: Set<String>?,
    servings: Double = 1.0,
) {
    val nutrientKeyMap =
        mapOf(
            stringResource(R.string.nutrient_saturated_fat) to "saturatedFat",
            stringResource(R.string.nutrient_monounsaturated_fat) to "monounsaturatedFat",
            stringResource(R.string.nutrient_polyunsaturated_fat) to "polyunsaturatedFat",
            stringResource(R.string.nutrient_trans_fat) to "transFat",
            stringResource(R.string.nutrient_cholesterol) to "cholesterol",
            stringResource(R.string.nutrient_omega3) to "omega3",
            stringResource(R.string.nutrient_omega6) to "omega6",
            stringResource(R.string.nutrient_sugar) to "sugar",
            stringResource(R.string.nutrient_added_sugars) to "addedSugars",
            stringResource(R.string.nutrient_sugar_alcohols) to "sugarAlcohols",
            stringResource(R.string.nutrient_starch) to "starch",
            stringResource(R.string.nutrient_sodium) to "sodium",
            stringResource(R.string.nutrient_potassium) to "potassium",
            stringResource(R.string.nutrient_calcium) to "calcium",
            stringResource(R.string.nutrient_iron) to "iron",
            stringResource(R.string.nutrient_magnesium) to "magnesium",
            stringResource(R.string.nutrient_phosphorus) to "phosphorus",
            stringResource(R.string.nutrient_zinc) to "zinc",
            stringResource(R.string.nutrient_copper) to "copper",
            stringResource(R.string.nutrient_manganese) to "manganese",
            stringResource(R.string.nutrient_selenium) to "selenium",
            stringResource(R.string.nutrient_iodine) to "iodine",
            stringResource(R.string.nutrient_fluoride) to "fluoride",
            stringResource(R.string.nutrient_chromium) to "chromium",
            stringResource(R.string.nutrient_molybdenum) to "molybdenum",
            stringResource(R.string.nutrient_chloride) to "chloride",
            stringResource(R.string.nutrient_vitamin_a) to "vitaminA",
            stringResource(R.string.nutrient_vitamin_c) to "vitaminC",
            stringResource(R.string.nutrient_vitamin_d) to "vitaminD",
            stringResource(R.string.nutrient_vitamin_e) to "vitaminE",
            stringResource(R.string.nutrient_vitamin_k) to "vitaminK",
            stringResource(R.string.nutrient_vitamin_b1) to "vitaminB1",
            stringResource(R.string.nutrient_vitamin_b2) to "vitaminB2",
            stringResource(R.string.nutrient_vitamin_b3) to "vitaminB3",
            stringResource(R.string.nutrient_vitamin_b5) to "vitaminB5",
            stringResource(R.string.nutrient_vitamin_b6) to "vitaminB6",
            stringResource(R.string.nutrient_vitamin_b7) to "vitaminB7",
            stringResource(R.string.nutrient_vitamin_b9) to "vitaminB9",
            stringResource(R.string.nutrient_vitamin_b12) to "vitaminB12",
            stringResource(R.string.nutrient_caffeine) to "caffeine",
            stringResource(R.string.nutrient_alcohol) to "alcohol",
            stringResource(R.string.nutrient_water) to "water",
            stringResource(R.string.nutrient_salt) to "salt",
        )

    fun List<Pair<String, Pair<Double, String>>>.filterVisible() =
        if (visibleNutrients == null) {
            this
        } else {
            filter { (name, _) -> nutrientKeyMap[name]?.let { it in visibleNutrients } != false }
        }

    // Fat Breakdown
    val fatNutrients =
        listOfNotNull(
            food.saturatedFat?.let { stringResource(R.string.nutrient_saturated_fat) to Pair(it * servings, "g") },
            food.monounsaturatedFat?.let { stringResource(R.string.nutrient_monounsaturated_fat) to Pair(it * servings, "g") },
            food.polyunsaturatedFat?.let { stringResource(R.string.nutrient_polyunsaturated_fat) to Pair(it * servings, "g") },
            food.transFat?.let { stringResource(R.string.nutrient_trans_fat) to Pair(it * servings, "g") },
            food.cholesterol?.let { stringResource(R.string.nutrient_cholesterol) to Pair(it * servings, "mg") },
            food.omega3?.let { stringResource(R.string.nutrient_omega3) to Pair(it * servings, "mg") },
            food.omega6?.let { stringResource(R.string.nutrient_omega6) to Pair(it * servings, "mg") },
        )
    val filteredFatNutrients = fatNutrients.filterVisible()
    if (filteredFatNutrients.isNotEmpty()) {
        Spacer(modifier = Modifier.height(12.dp))
        NutrientCategoryCard(stringResource(R.string.nutrient_category_fat_breakdown), filteredFatNutrients)
    }

    // Sugar & Carbs
    val sugarNutrients =
        listOfNotNull(
            food.sugar?.let { stringResource(R.string.nutrient_sugar) to Pair(it * servings, "g") },
            food.addedSugars?.let { stringResource(R.string.nutrient_added_sugars) to Pair(it * servings, "g") },
            food.sugarAlcohols?.let { stringResource(R.string.nutrient_sugar_alcohols) to Pair(it * servings, "g") },
            food.starch?.let { stringResource(R.string.nutrient_starch) to Pair(it * servings, "g") },
        )
    val filteredSugarNutrients = sugarNutrients.filterVisible()
    if (filteredSugarNutrients.isNotEmpty()) {
        Spacer(modifier = Modifier.height(12.dp))
        NutrientCategoryCard(stringResource(R.string.nutrient_category_sugar_carb), filteredSugarNutrients)
    }

    // Minerals
    val mineralNutrients =
        listOfNotNull(
            food.sodium?.let { stringResource(R.string.nutrient_sodium) to Pair(it * servings, "mg") },
            food.potassium?.let { stringResource(R.string.nutrient_potassium) to Pair(it * servings, "mg") },
            food.calcium?.let { stringResource(R.string.nutrient_calcium) to Pair(it * servings, "mg") },
            food.iron?.let { stringResource(R.string.nutrient_iron) to Pair(it * servings, "mg") },
            food.magnesium?.let { stringResource(R.string.nutrient_magnesium) to Pair(it * servings, "mg") },
            food.phosphorus?.let { stringResource(R.string.nutrient_phosphorus) to Pair(it * servings, "mg") },
            food.zinc?.let { stringResource(R.string.nutrient_zinc) to Pair(it * servings, "mg") },
            food.copper?.let { stringResource(R.string.nutrient_copper) to Pair(it * servings, "mg") },
            food.manganese?.let { stringResource(R.string.nutrient_manganese) to Pair(it * servings, "mg") },
            food.selenium?.let { stringResource(R.string.nutrient_selenium) to Pair(it * servings, "mcg") },
            food.iodine?.let { stringResource(R.string.nutrient_iodine) to Pair(it * servings, "mcg") },
            food.fluoride?.let { stringResource(R.string.nutrient_fluoride) to Pair(it * servings, "mg") },
            food.chromium?.let { stringResource(R.string.nutrient_chromium) to Pair(it * servings, "mcg") },
            food.molybdenum?.let { stringResource(R.string.nutrient_molybdenum) to Pair(it * servings, "mcg") },
            food.chloride?.let { stringResource(R.string.nutrient_chloride) to Pair(it * servings, "mg") },
        )
    val filteredMineralNutrients = mineralNutrients.filterVisible()
    if (filteredMineralNutrients.isNotEmpty()) {
        Spacer(modifier = Modifier.height(12.dp))
        NutrientCategoryCard(stringResource(R.string.nutrient_category_mineral), filteredMineralNutrients)
    }

    // Vitamins
    val vitaminNutrients =
        listOfNotNull(
            food.vitaminA?.let { stringResource(R.string.nutrient_vitamin_a) to Pair(it * servings, "mcg") },
            food.vitaminC?.let { stringResource(R.string.nutrient_vitamin_c) to Pair(it * servings, "mg") },
            food.vitaminD?.let { stringResource(R.string.nutrient_vitamin_d) to Pair(it * servings, "mcg") },
            food.vitaminE?.let { stringResource(R.string.nutrient_vitamin_e) to Pair(it * servings, "mg") },
            food.vitaminK?.let { stringResource(R.string.nutrient_vitamin_k) to Pair(it * servings, "mcg") },
            food.vitaminB1?.let { stringResource(R.string.nutrient_vitamin_b1) to Pair(it * servings, "mg") },
            food.vitaminB2?.let { stringResource(R.string.nutrient_vitamin_b2) to Pair(it * servings, "mg") },
            food.vitaminB3?.let { stringResource(R.string.nutrient_vitamin_b3) to Pair(it * servings, "mg") },
            food.vitaminB5?.let { stringResource(R.string.nutrient_vitamin_b5) to Pair(it * servings, "mg") },
            food.vitaminB6?.let { stringResource(R.string.nutrient_vitamin_b6) to Pair(it * servings, "mg") },
            food.vitaminB7?.let { stringResource(R.string.nutrient_vitamin_b7) to Pair(it * servings, "mcg") },
            food.vitaminB9?.let { stringResource(R.string.nutrient_vitamin_b9) to Pair(it * servings, "mcg") },
            food.vitaminB12?.let { stringResource(R.string.nutrient_vitamin_b12) to Pair(it * servings, "mcg") },
        )
    val filteredVitaminNutrients = vitaminNutrients.filterVisible()
    if (filteredVitaminNutrients.isNotEmpty()) {
        Spacer(modifier = Modifier.height(12.dp))
        NutrientCategoryCard(stringResource(R.string.nutrient_category_vitamin), filteredVitaminNutrients)
    }

    // Other
    val otherNutrients =
        listOfNotNull(
            food.caffeine?.let { stringResource(R.string.nutrient_caffeine) to Pair(it * servings, "mg") },
            food.alcohol?.let { stringResource(R.string.nutrient_alcohol) to Pair(it * servings, "g") },
            food.water?.let { stringResource(R.string.nutrient_water) to Pair(it * servings, "ml") },
            food.salt?.let { stringResource(R.string.nutrient_salt) to Pair(it * servings, "g") },
        )
    val filteredOtherNutrients = otherNutrients.filterVisible()
    if (filteredOtherNutrients.isNotEmpty()) {
        Spacer(modifier = Modifier.height(12.dp))
        NutrientCategoryCard(stringResource(R.string.nutrient_category_other), filteredOtherNutrients)
    }
}

@Composable
fun MacroRow(
    label: String,
    value: Double,
    unit: String,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = color)
        Text(
            "${value.formatNutrient()} $unit",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun FoodQualityCard(food: Food) {
    val hasQualityInfo =
        food.nutriScore != null ||
            food.novaGroup != null ||
            !food.additives.isNullOrEmpty() ||
            !food.ingredientsText.isNullOrBlank()

    if (!hasQualityInfo) return

    Spacer(modifier = Modifier.height(12.dp))
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.food_detail_quality),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(12.dp))

            food.nutriScore?.let { score ->
                NutriScoreBadge(score)
                Spacer(modifier = Modifier.height(12.dp))
            }

            food.novaGroup?.let { group ->
                NovaGroupBadge(group)
                if (!food.additives.isNullOrEmpty() || !food.ingredientsText.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }

            if (!food.additives.isNullOrEmpty()) {
                AdditivesSection(food.additives!!)
                if (!food.ingredientsText.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }

            food.ingredientsText?.takeIf { it.isNotBlank() }?.let { text ->
                IngredientsSection(text)
            }
        }
    }
}

@Composable
private fun NutriScoreBadge(score: String) {
    val letters = listOf("A", "B", "C", "D", "E")
    val colors = listOf(NutriScoreA, NutriScoreB, NutriScoreC, NutriScoreD, NutriScoreE)
    val activeIndex = letters.indexOfFirst { it.equals(score, ignoreCase = true) }

    Column {
        Text(
            stringResource(R.string.food_detail_nutriscore),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            letters.forEachIndexed { index, letter ->
                val isActive = index == activeIndex
                val bgColor = if (isActive) colors[index] else colors[index].copy(alpha = 0.15f)
                val textColor = if (isActive) Color.White else colors[index].copy(alpha = 0.5f)
                val size = if (isActive) 40.dp else 32.dp
                val fontSize = if (isActive) 18.sp else 14.sp

                Box(
                    modifier =
                        Modifier
                            .size(size)
                            .clip(RoundedCornerShape(6.dp))
                            .background(bgColor),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        letter,
                        color = textColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = fontSize,
                    )
                }
            }
        }
    }
}

@Composable
private fun NovaGroupBadge(group: Int) {
    val novaInfo =
        when (group) {
            1 -> Pair(stringResource(R.string.food_detail_nova_1), NovaGreen)
            2 -> Pair(stringResource(R.string.food_detail_nova_2), NovaYellow)
            3 -> Pair(stringResource(R.string.food_detail_nova_3), NovaOrange)
            4 -> Pair(stringResource(R.string.food_detail_nova_4), NovaRed)
            else -> return
        }

    Column {
        Text(
            stringResource(R.string.food_detail_nova_group),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(novaInfo.second),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    group.toString(),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                )
            }
            Text(
                novaInfo.first,
                style = MaterialTheme.typography.bodyMedium,
                color = novaInfo.second,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun AdditivesSection(additives: List<String>) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                stringResource(R.string.food_detail_additives),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(
                    additives.size.toString(),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            additives.forEach { additive ->
                val cleaned = formatAdditive(additive)
                Text(
                    cleaned,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun formatAdditive(raw: String): String {
    var text = raw.trim()
    if (text.startsWith("en:")) {
        text = text.removePrefix("en:")
    }
    val parts = text.split(" - ", limit = 2)
    if (parts.size == 2) {
        val code = parts[0].trim().uppercase()
        val name = parts[1].trim().replaceFirstChar { it.uppercaseChar() }
        return "$code - $name"
    }
    return text.uppercase()
}

@Composable
private fun IngredientsSection(text: String) {
    var expanded by remember { mutableStateOf(false) }
    val isLong = text.length > 150

    Column {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .then(if (isLong) Modifier.clickable { expanded = !expanded } else Modifier),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.food_detail_ingredients),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (isLong) {
                Icon(
                    if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = stringResource(if (expanded) R.string.food_detail_collapse else R.string.food_detail_expand),
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Surface(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .animateContentSize(),
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ) {
            Text(
                text,
                modifier = Modifier.padding(10.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = if (isLong && !expanded) 3 else Int.MAX_VALUE,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
