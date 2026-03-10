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
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.MealPickerSheet
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
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
                    if (fatNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Fat Breakdown", fatNutrients)
                    }

                    // Sugar & Carbs
                    val sugarNutrients =
                        listOfNotNull(
                            f.sugar?.let { "Sugar" to Pair(it, "g") },
                            f.addedSugars?.let { "Added Sugars" to Pair(it, "g") },
                            f.sugarAlcohols?.let { "Sugar Alcohols" to Pair(it, "g") },
                            f.starch?.let { "Starch" to Pair(it, "g") },
                        )
                    if (sugarNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Sugar & Carbs", sugarNutrients)
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
                    if (mineralNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Minerals", mineralNutrients)
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
                    if (vitaminNutrients.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        NutrientCategoryCard("Vitamins", vitaminNutrients)
                    }

                    // Other
                    val otherNutrients =
                        listOfNotNull(
                            f.caffeine?.let { "Caffeine" to Pair(it, "mg") },
                            f.alcohol?.let { "Alcohol" to Pair(it, "g") },
                            f.water?.let { "Water" to Pair(it, "ml") },
                            f.salt?.let { "Salt" to Pair(it, "g") },
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
