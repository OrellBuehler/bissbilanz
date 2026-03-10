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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodDetailScreen(
    foodId: String,
    navController: NavController,
) {
    val foodRepo: FoodRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val prefs by prefsRepo.preferences.collectAsStateWithLifecycle()
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
        prefsRepo.loadPreferences()
        try {
            food = foodRepo.getFood(foodId)
        } catch (_: Exception) {
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

                    // Fat Breakdown
                    val vn = visibleNutrients
                    val fatNutrients =
                        listOfNotNull(
                            f.saturatedFat?.takeIf { vn == null || "saturatedFat" in vn }?.let { "Saturated Fat" to Pair(it, "g") },
                            f.monounsaturatedFat?.takeIf { vn == null || "monounsaturatedFat" in vn }?.let {
                                "Monounsat. Fat" to
                                    Pair(it, "g")
                            },
                            f.polyunsaturatedFat?.takeIf { vn == null || "polyunsaturatedFat" in vn }?.let {
                                "Polyunsat. Fat" to
                                    Pair(it, "g")
                            },
                            f.transFat?.takeIf { vn == null || "transFat" in vn }?.let { "Trans Fat" to Pair(it, "g") },
                            f.cholesterol?.takeIf { vn == null || "cholesterol" in vn }?.let { "Cholesterol" to Pair(it, "mg") },
                            f.omega3?.takeIf { vn == null || "omega3" in vn }?.let { "Omega-3" to Pair(it, "mg") },
                            f.omega6?.takeIf { vn == null || "omega6" in vn }?.let { "Omega-6" to Pair(it, "mg") },
                        )
                    if (fatNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Fat Breakdown", fatNutrients)
                    }

                    // Sugar & Carbs
                    val sugarNutrients =
                        listOfNotNull(
                            f.sugar?.takeIf { vn == null || "sugar" in vn }?.let { "Sugar" to Pair(it, "g") },
                            f.addedSugars?.takeIf { vn == null || "addedSugars" in vn }?.let { "Added Sugars" to Pair(it, "g") },
                            f.sugarAlcohols?.takeIf { vn == null || "sugarAlcohols" in vn }?.let { "Sugar Alcohols" to Pair(it, "g") },
                            f.starch?.takeIf { vn == null || "starch" in vn }?.let { "Starch" to Pair(it, "g") },
                        )
                    if (sugarNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Sugar & Carbs", sugarNutrients)
                    }

                    // Minerals
                    val mineralNutrients =
                        listOfNotNull(
                            f.sodium?.takeIf { vn == null || "sodium" in vn }?.let { "Sodium" to Pair(it, "mg") },
                            f.potassium?.takeIf { vn == null || "potassium" in vn }?.let { "Potassium" to Pair(it, "mg") },
                            f.calcium?.takeIf { vn == null || "calcium" in vn }?.let { "Calcium" to Pair(it, "mg") },
                            f.iron?.takeIf { vn == null || "iron" in vn }?.let { "Iron" to Pair(it, "mg") },
                            f.magnesium?.takeIf { vn == null || "magnesium" in vn }?.let { "Magnesium" to Pair(it, "mg") },
                            f.phosphorus?.takeIf { vn == null || "phosphorus" in vn }?.let { "Phosphorus" to Pair(it, "mg") },
                            f.zinc?.takeIf { vn == null || "zinc" in vn }?.let { "Zinc" to Pair(it, "mg") },
                            f.copper?.takeIf { vn == null || "copper" in vn }?.let { "Copper" to Pair(it, "mg") },
                            f.manganese?.takeIf { vn == null || "manganese" in vn }?.let { "Manganese" to Pair(it, "mg") },
                            f.selenium?.takeIf { vn == null || "selenium" in vn }?.let { "Selenium" to Pair(it, "mcg") },
                            f.iodine?.takeIf { vn == null || "iodine" in vn }?.let { "Iodine" to Pair(it, "mcg") },
                            f.fluoride?.takeIf { vn == null || "fluoride" in vn }?.let { "Fluoride" to Pair(it, "mg") },
                            f.chromium?.takeIf { vn == null || "chromium" in vn }?.let { "Chromium" to Pair(it, "mcg") },
                            f.molybdenum?.takeIf { vn == null || "molybdenum" in vn }?.let { "Molybdenum" to Pair(it, "mcg") },
                            f.chloride?.takeIf { vn == null || "chloride" in vn }?.let { "Chloride" to Pair(it, "mg") },
                        )
                    if (mineralNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Minerals", mineralNutrients)
                    }

                    // Vitamins
                    val vitaminNutrients =
                        listOfNotNull(
                            f.vitaminA?.takeIf { vn == null || "vitaminA" in vn }?.let { "Vitamin A" to Pair(it, "mcg") },
                            f.vitaminC?.takeIf { vn == null || "vitaminC" in vn }?.let { "Vitamin C" to Pair(it, "mg") },
                            f.vitaminD?.takeIf { vn == null || "vitaminD" in vn }?.let { "Vitamin D" to Pair(it, "mcg") },
                            f.vitaminE?.takeIf { vn == null || "vitaminE" in vn }?.let { "Vitamin E" to Pair(it, "mg") },
                            f.vitaminK?.takeIf { vn == null || "vitaminK" in vn }?.let { "Vitamin K" to Pair(it, "mcg") },
                            f.vitaminB1?.takeIf { vn == null || "vitaminB1" in vn }?.let { "Vitamin B1" to Pair(it, "mg") },
                            f.vitaminB2?.takeIf { vn == null || "vitaminB2" in vn }?.let { "Vitamin B2" to Pair(it, "mg") },
                            f.vitaminB3?.takeIf { vn == null || "vitaminB3" in vn }?.let { "Vitamin B3" to Pair(it, "mg") },
                            f.vitaminB5?.takeIf { vn == null || "vitaminB5" in vn }?.let { "Vitamin B5" to Pair(it, "mg") },
                            f.vitaminB6?.takeIf { vn == null || "vitaminB6" in vn }?.let { "Vitamin B6" to Pair(it, "mg") },
                            f.vitaminB7?.takeIf { vn == null || "vitaminB7" in vn }?.let { "Vitamin B7" to Pair(it, "mcg") },
                            f.vitaminB9?.takeIf { vn == null || "vitaminB9" in vn }?.let { "Vitamin B9" to Pair(it, "mcg") },
                            f.vitaminB12?.takeIf { vn == null || "vitaminB12" in vn }?.let { "Vitamin B12" to Pair(it, "mcg") },
                        )
                    if (vitaminNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Vitamins", vitaminNutrients)
                    }

                    // Other
                    val otherNutrients =
                        listOfNotNull(
                            f.caffeine?.takeIf { vn == null || "caffeine" in vn }?.let { "Caffeine" to Pair(it, "mg") },
                            f.alcohol?.takeIf { vn == null || "alcohol" in vn }?.let { "Alcohol" to Pair(it, "g") },
                            f.water?.takeIf { vn == null || "water" in vn }?.let { "Water" to Pair(it, "ml") },
                            f.salt?.takeIf { vn == null || "salt" in vn }?.let { "Salt" to Pair(it, "g") },
                        )
                    if (otherNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Other", otherNutrients)
                    }

                    // Metadata
                    val hasMetadata = f.nutriScore != null || f.novaGroup != null || f.ingredientsText != null
                    if (hasMetadata) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Info", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Spacer(modifier = Modifier.height(8.dp))
                                f.nutriScore?.let {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("Nutri-Score")
                                        Text(it.uppercase(), fontWeight = FontWeight.Bold)
                                    }
                                }
                                f.novaGroup?.let {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("NOVA Group")
                                        Text(it.toString(), fontWeight = FontWeight.Bold)
                                    }
                                }
                                f.ingredientsText?.let {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("Ingredients", style = MaterialTheme.typography.labelLarge)
                                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            "${if (value == value.toLong().toDouble()) value.toLong().toString() else "%.1f".format(value)} $unit",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
