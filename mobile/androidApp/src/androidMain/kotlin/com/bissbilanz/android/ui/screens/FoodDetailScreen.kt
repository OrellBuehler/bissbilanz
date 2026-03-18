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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.toDisplayString
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject
import org.koin.core.qualifier.named

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
    val baseUrl: String = koinInject(named("baseUrl"))
    val prefsRepo: PreferencesRepository = koinInject()
    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(null)
    val visibleNutrients = prefs?.visibleNutrients?.toSet()
    var food by remember { mutableStateOf<Food?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var showLogDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showEditSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(foodId) {
        isLoading = true
        try {
            food = foodRepo.getFood(foodId)
            prefsRepo.refresh()
        } catch (_: Exception) {
            snackbarHostState.showSnackbar("Failed to load food details")
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
                        snackbarHostState.showSnackbar("Logged ${food!!.name}")
                    } catch (_: Exception) {
                        snackbarHostState.showSnackbar("Failed to log food")
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
                scope.launch {
                    try {
                        food = foodRepo.getFood(foodId)
                    } catch (_: Exception) {
                    }
                }
            },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Food") },
            text = { Text("Are you sure you want to delete \"${food?.name}\"? This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                foodRepo.deleteFood(foodId)
                                navController.popBackStack()
                            } catch (_: Exception) {
                                snackbarHostState.showSnackbar("Failed to delete food")
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
                title = { Text(food?.name ?: "Food") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (food != null) {
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
            if (food != null) {
                ExtendedFloatingActionButton(
                    onClick = { showLogDialog = true },
                    icon = { Icon(Icons.Default.Add, "Log") },
                    text = { Text("Log this food") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (isLoading) {
            LoadingScreen()
        } else {
            food?.let { f ->
                Column(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .padding(padding)
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                ) {
                    f.imageUrl?.let { url ->
                        val imageUrl = if (url.startsWith("/")) "$baseUrl$url" else url
                        AsyncImage(
                            model = imageUrl,
                            contentDescription = f.name,
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 200.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            contentScale = ContentScale.Crop,
                            alignment = Alignment.Center,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    f.brand?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(4.dp))
                    }

                    Text(
                        "Per ${f.servingSize.toInt()} ${f.servingUnit.name.lowercase()}",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    f.barcode?.let {
                        Text(
                            "Barcode: $it",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Main macros card
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Macros", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroRow("Calories", f.calories, "kcal", CaloriesBlue)
                            MacroRow("Protein", f.protein, "g", ProteinRed)
                            MacroRow("Carbs", f.carbs, "g", CarbsOrange)
                            MacroRow("Fat", f.fat, "g", FatYellow)
                            MacroRow("Fiber", f.fiber, "g", FiberGreen)
                        }
                    }

                    val nutrientKeyMap =
                        mapOf(
                            "Saturated Fat" to "saturatedFat",
                            "Monounsat. Fat" to "monounsaturatedFat",
                            "Polyunsat. Fat" to "polyunsaturatedFat",
                            "Trans Fat" to "transFat",
                            "Cholesterol" to "cholesterol",
                            "Omega-3" to "omega3",
                            "Omega-6" to "omega6",
                            "Sugar" to "sugar",
                            "Added Sugars" to "addedSugars",
                            "Sugar Alcohols" to "sugarAlcohols",
                            "Starch" to "starch",
                            "Sodium" to "sodium",
                            "Potassium" to "potassium",
                            "Calcium" to "calcium",
                            "Iron" to "iron",
                            "Magnesium" to "magnesium",
                            "Phosphorus" to "phosphorus",
                            "Zinc" to "zinc",
                            "Copper" to "copper",
                            "Manganese" to "manganese",
                            "Selenium" to "selenium",
                            "Iodine" to "iodine",
                            "Fluoride" to "fluoride",
                            "Chromium" to "chromium",
                            "Molybdenum" to "molybdenum",
                            "Chloride" to "chloride",
                            "Vitamin A" to "vitaminA",
                            "Vitamin C" to "vitaminC",
                            "Vitamin D" to "vitaminD",
                            "Vitamin E" to "vitaminE",
                            "Vitamin K" to "vitaminK",
                            "Vitamin B1" to "vitaminB1",
                            "Vitamin B2" to "vitaminB2",
                            "Vitamin B3" to "vitaminB3",
                            "Vitamin B5" to "vitaminB5",
                            "Vitamin B6" to "vitaminB6",
                            "Vitamin B7" to "vitaminB7",
                            "Vitamin B9" to "vitaminB9",
                            "Vitamin B12" to "vitaminB12",
                            "Caffeine" to "caffeine",
                            "Alcohol" to "alcohol",
                            "Water" to "water",
                            "Salt" to "salt",
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
                            f.saturatedFat?.let { "Saturated Fat" to Pair(it, "g") },
                            f.monounsaturatedFat?.let { "Monounsat. Fat" to Pair(it, "g") },
                            f.polyunsaturatedFat?.let { "Polyunsat. Fat" to Pair(it, "g") },
                            f.transFat?.let { "Trans Fat" to Pair(it, "g") },
                            f.cholesterol?.let { "Cholesterol" to Pair(it, "mg") },
                            f.omega3?.let { "Omega-3" to Pair(it, "mg") },
                            f.omega6?.let { "Omega-6" to Pair(it, "mg") },
                        )
                    val filteredFatNutrients = fatNutrients.filterVisible()
                    if (filteredFatNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Fat Breakdown", filteredFatNutrients)
                    }

                    // Sugar & Carbs
                    val sugarNutrients =
                        listOfNotNull(
                            f.sugar?.let { "Sugar" to Pair(it, "g") },
                            f.addedSugars?.let { "Added Sugars" to Pair(it, "g") },
                            f.sugarAlcohols?.let { "Sugar Alcohols" to Pair(it, "g") },
                            f.starch?.let { "Starch" to Pair(it, "g") },
                        )
                    val filteredSugarNutrients = sugarNutrients.filterVisible()
                    if (filteredSugarNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Sugar & Carbs", filteredSugarNutrients)
                    }

                    // Minerals
                    val mineralNutrients =
                        listOfNotNull(
                            f.sodium?.let { "Sodium" to Pair(it, "mg") },
                            f.potassium?.let { "Potassium" to Pair(it, "mg") },
                            f.calcium?.let { "Calcium" to Pair(it, "mg") },
                            f.iron?.let { "Iron" to Pair(it, "mg") },
                            f.magnesium?.let { "Magnesium" to Pair(it, "mg") },
                            f.phosphorus?.let { "Phosphorus" to Pair(it, "mg") },
                            f.zinc?.let { "Zinc" to Pair(it, "mg") },
                            f.copper?.let { "Copper" to Pair(it, "mg") },
                            f.manganese?.let { "Manganese" to Pair(it, "mg") },
                            f.selenium?.let { "Selenium" to Pair(it, "mcg") },
                            f.iodine?.let { "Iodine" to Pair(it, "mcg") },
                            f.fluoride?.let { "Fluoride" to Pair(it, "mg") },
                            f.chromium?.let { "Chromium" to Pair(it, "mcg") },
                            f.molybdenum?.let { "Molybdenum" to Pair(it, "mcg") },
                            f.chloride?.let { "Chloride" to Pair(it, "mg") },
                        )
                    val filteredMineralNutrients = mineralNutrients.filterVisible()
                    if (filteredMineralNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Minerals", filteredMineralNutrients)
                    }

                    // Vitamins
                    val vitaminNutrients =
                        listOfNotNull(
                            f.vitaminA?.let { "Vitamin A" to Pair(it, "mcg") },
                            f.vitaminC?.let { "Vitamin C" to Pair(it, "mg") },
                            f.vitaminD?.let { "Vitamin D" to Pair(it, "mcg") },
                            f.vitaminE?.let { "Vitamin E" to Pair(it, "mg") },
                            f.vitaminK?.let { "Vitamin K" to Pair(it, "mcg") },
                            f.vitaminB1?.let { "Vitamin B1" to Pair(it, "mg") },
                            f.vitaminB2?.let { "Vitamin B2" to Pair(it, "mg") },
                            f.vitaminB3?.let { "Vitamin B3" to Pair(it, "mg") },
                            f.vitaminB5?.let { "Vitamin B5" to Pair(it, "mg") },
                            f.vitaminB6?.let { "Vitamin B6" to Pair(it, "mg") },
                            f.vitaminB7?.let { "Vitamin B7" to Pair(it, "mcg") },
                            f.vitaminB9?.let { "Vitamin B9" to Pair(it, "mcg") },
                            f.vitaminB12?.let { "Vitamin B12" to Pair(it, "mcg") },
                        )
                    val filteredVitaminNutrients = vitaminNutrients.filterVisible()
                    if (filteredVitaminNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Vitamins", filteredVitaminNutrients)
                    }

                    // Other
                    val otherNutrients =
                        listOfNotNull(
                            f.caffeine?.let { "Caffeine" to Pair(it, "mg") },
                            f.alcohol?.let { "Alcohol" to Pair(it, "g") },
                            f.water?.let { "Water" to Pair(it, "ml") },
                            f.salt?.let { "Salt" to Pair(it, "g") },
                        )
                    val filteredOtherNutrients = otherNutrients.filterVisible()
                    if (filteredOtherNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Other", filteredOtherNutrients)
                    }

                    // Food Quality
                    FoodQualityCard(f)

                    Spacer(modifier = Modifier.height(80.dp))
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
            "${value.toDisplayString()} $unit",
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
            Text("Food Quality", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
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
            "Nutri-Score",
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
            1 -> Pair("Unprocessed or minimally processed", NovaGreen)
            2 -> Pair("Processed culinary ingredients", NovaYellow)
            3 -> Pair("Processed foods", NovaOrange)
            4 -> Pair("Ultra-processed", NovaRed)
            else -> return
        }

    Column {
        Text(
            "NOVA Group",
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
                "Additives",
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
                "Ingredients",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (isLong) {
                Icon(
                    if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "Collapse" else "Expand",
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
