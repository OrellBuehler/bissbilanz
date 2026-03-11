package com.bissbilanz.android.ui.screens

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.HealthSyncService
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.RecipeEditSheet
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealType
import com.bissbilanz.model.MealTypeCreate
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun SettingsScreen(navController: NavController) {
    val authManager: AuthManager = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val api: BissbilanzApi = koinInject()
    val healthSync: HealthSyncService = koinInject()
    val goals by goalsRepo.goals.collectAsStateWithLifecycle()
    val prefs by prefsRepo.preferences.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var showGoalsDialog by remember { mutableStateOf(false) }
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var showCreateFoodSheet by remember { mutableStateOf(false) }
    var showCreateRecipeSheet by remember { mutableStateOf(false) }
    var customMealTypes by remember { mutableStateOf<List<MealType>>(emptyList()) }
    var editedNutrients by remember { mutableStateOf<Set<String>?>(null) }
    var nutrientsDirty by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val healthPrefs = context.getSharedPreferences("health_connect", Context.MODE_PRIVATE)
    var healthAvailable by remember { mutableStateOf(false) }
    var healthPermGranted by remember { mutableStateOf(false) }
    var healthSyncEnabled by remember { mutableStateOf(healthPrefs.getBoolean("sync_enabled", false)) }
    val permissionLauncher =
        rememberLauncherForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
        ) {
            scope.launch {
                healthPermGranted = healthSync.hasPermissions()
            }
        }

    LaunchedEffect(prefs) {
        if (editedNutrients == null && prefs != null) {
            editedNutrients = prefs!!.visibleNutrients.toSet()
        }
    }

    LaunchedEffect(Unit) {
        goalsRepo.loadGoals()
        prefsRepo.loadPreferences()
        try {
            val response = api.getMealTypes()
            customMealTypes = response.mealTypes
        } catch (_: Exception) {
        }
        healthAvailable = healthSync.isAvailable()
        if (healthAvailable) {
            healthPermGranted = healthSync.hasPermissions()
        }
    }

    if (showGoalsDialog) {
        GoalsEditDialog(
            currentGoals = goals,
            onDismiss = { showGoalsDialog = false },
            onSave = { newGoals ->
                scope.launch {
                    try {
                        goalsRepo.setGoals(newGoals)
                        snackbarHostState.showSnackbar("Goals updated")
                    } catch (_: Exception) {
                        snackbarHostState.showSnackbar("Failed to update goals")
                    }
                }
                showGoalsDialog = false
            },
        )
    }

    if (showMealTypeDialog) {
        var newMealName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showMealTypeDialog = false },
            title = { Text("Add Custom Meal Type") },
            text = {
                OutlinedTextField(
                    value = newMealName,
                    onValueChange = { newMealName = it },
                    label = { Text("Meal type name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newMealName.isNotBlank()) {
                        scope.launch {
                            try {
                                api.createMealType(MealTypeCreate(name = newMealName.trim()))
                                val response = api.getMealTypes()
                                customMealTypes = response.mealTypes
                                snackbarHostState.showSnackbar("Meal type added")
                            } catch (_: Exception) {
                                snackbarHostState.showSnackbar("Failed to add meal type")
                            }
                        }
                    }
                    showMealTypeDialog = false
                }) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { showMealTypeDialog = false }) { Text("Cancel") }
            },
        )
    }

    if (showCreateFoodSheet) {
        FoodEditSheet(
            foodId = null,
            onDismiss = { showCreateFoodSheet = false },
            onSaved = { showCreateFoodSheet = false },
        )
    }

    if (showCreateRecipeSheet) {
        RecipeEditSheet(
            recipeId = null,
            onDismiss = { showCreateRecipeSheet = false },
            onSaved = { showCreateRecipeSheet = false },
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
        ) {
            Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))

            // Goals section
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Daily Goals", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    goals?.let { g ->
                        GoalRow("Calories", g.calorieGoal, "kcal", CaloriesBlue)
                        GoalRow("Protein", g.proteinGoal, "g", ProteinRed)
                        GoalRow("Carbs", g.carbGoal, "g", CarbsOrange)
                        GoalRow("Fat", g.fatGoal, "g", FatYellow)
                        GoalRow("Fiber", g.fiberGoal, "g", FiberGreen)
                    } ?: Text("No goals set", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { showGoalsDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Edit, "Edit", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Edit Goals")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Navigation items
            Card(modifier = Modifier.fillMaxWidth()) {
                Column {
                    SettingsNavItem("Weight Log", Icons.Default.MonitorWeight) {
                        navController.navigate("weight")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Supplements", Icons.Default.Medication) {
                        navController.navigate("supplements")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Recipes", Icons.Default.MenuBook) {
                        navController.navigate("recipes")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Calendar", Icons.Default.CalendarMonth) {
                        navController.navigate("calendar")
                    }
                    HorizontalDivider()
                    SettingsNavItem("Maintenance Calculator", Icons.Default.Calculate) {
                        navController.navigate("maintenance")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Health Connect
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Health Connect",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (!healthAvailable) {
                        Text(
                            "Health Connect is not available on this device",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Sync to Health Connect")
                            Switch(
                                checked = healthSyncEnabled,
                                onCheckedChange = { enabled ->
                                    healthSyncEnabled = enabled
                                    healthPrefs.edit().putBoolean("sync_enabled", enabled).apply()
                                },
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        if (healthPermGranted) {
                            Text(
                                "Permissions granted",
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        } else {
                            OutlinedButton(
                                onClick = {
                                    permissionLauncher.launch(healthSync.getRequiredPermissions())
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.HealthAndSafety, "Permissions", modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Grant Permissions")
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Quick actions
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Quick Actions", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilledTonalButton(
                            onClick = { showCreateFoodSheet = true },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Add, "Create food", modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Food")
                        }
                        FilledTonalButton(
                            onClick = { showCreateRecipeSheet = true },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Add, "Create recipe", modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Recipe")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Custom meal types
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "Custom Meal Types",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        IconButton(onClick = { showMealTypeDialog = true }) {
                            Icon(Icons.Default.Add, "Add meal type")
                        }
                    }
                    if (customMealTypes.isEmpty()) {
                        Text(
                            "Default meals only (Breakfast, Lunch, Dinner, Snack)",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        customMealTypes.forEach { mealType ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(mealType.name)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Dashboard Widgets
            prefs?.let { p ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Dashboard Widgets",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        WidgetToggle("Chart", p.showChartWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showChartWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                        WidgetToggle("Favorites", p.showFavoritesWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showFavoritesWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                        WidgetToggle("Supplements", p.showSupplementsWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showSupplementsWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                        WidgetToggle("Weight", p.showWeightWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showWeightWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                        WidgetToggle("Meal Breakdown", p.showMealBreakdownWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showMealBreakdownWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                        WidgetToggle("Top Foods", p.showTopFoodsWidget) { value ->
                            scope.launch {
                                try {
                                    prefsRepo.updatePreferences(PreferencesUpdate(showTopFoodsWidget = value))
                                } catch (_: Exception) {
                                    snackbarHostState.showSnackbar("Failed to update preference")
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Favorite Logging
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Favorite Logging",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = p.favoriteMealAssignmentMode == "time_based",
                                onClick = {
                                    scope.launch {
                                        try {
                                            prefsRepo.updatePreferences(
                                                PreferencesUpdate(favoriteMealAssignmentMode = "time_based"),
                                            )
                                            snackbarHostState.showSnackbar("Meal assignment updated")
                                        } catch (_: Exception) {
                                            snackbarHostState.showSnackbar("Failed to update preference")
                                        }
                                    }
                                },
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Auto-assign by time")
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = p.favoriteMealAssignmentMode == "ask_meal",
                                onClick = {
                                    scope.launch {
                                        try {
                                            prefsRepo.updatePreferences(
                                                PreferencesUpdate(favoriteMealAssignmentMode = "ask_meal"),
                                            )
                                            snackbarHostState.showSnackbar("Meal assignment updated")
                                        } catch (_: Exception) {
                                            snackbarHostState.showSnackbar("Failed to update preference")
                                        }
                                    }
                                },
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Always ask")
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Visible Nutrients
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Visible Nutrients",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Choose which nutrients to display on food detail pages",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedButton(
                                onClick = {
                                    editedNutrients = ALL_NUTRIENT_KEYS.toSet()
                                    nutrientsDirty = true
                                },
                                modifier = Modifier.weight(1f),
                            ) { Text("Select All") }
                            OutlinedButton(
                                onClick = {
                                    editedNutrients = emptySet()
                                    nutrientsDirty = true
                                },
                                modifier = Modifier.weight(1f),
                            ) { Text("Deselect All") }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        editedNutrients?.let { selected ->
                            NUTRIENT_CATEGORIES.forEach { (category, nutrients) ->
                                Text(
                                    category,
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                                )
                                nutrients.forEach { (key, label) ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Checkbox(
                                            checked = key in selected,
                                            onCheckedChange = { checked ->
                                                editedNutrients = if (checked) selected + key else selected - key
                                                nutrientsDirty = true
                                            },
                                        )
                                        Text(label, style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                        }
                        if (nutrientsDirty) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = {
                                    scope.launch {
                                        try {
                                            prefsRepo.updatePreferences(
                                                PreferencesUpdate(visibleNutrients = editedNutrients?.toList() ?: emptyList()),
                                            )
                                            nutrientsDirty = false
                                            snackbarHostState.showSnackbar("Visible nutrients updated")
                                        } catch (_: Exception) {
                                            snackbarHostState.showSnackbar("Failed to update nutrients")
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Save") }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            // Account
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Account", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(
                        onClick = { authManager.logout() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Text("Sign out")
                    }
                }
            }
        }
    }
}

@Composable
fun GoalRow(
    label: String,
    value: Double,
    unit: String,
    color: androidx.compose.ui.graphics.Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = color)
        Text("${value.toInt()} $unit", fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SettingsNavItem(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = { Text(title) },
        leadingContent = { Icon(icon, title, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = { Icon(Icons.AutoMirrored.Filled.ArrowForward, "Go", tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsEditDialog(
    currentGoals: Goals?,
    onDismiss: () -> Unit,
    onSave: (Goals) -> Unit,
) {
    var calories by remember { mutableStateOf(currentGoals?.calorieGoal?.toInt()?.toString() ?: "2000") }
    var protein by remember { mutableStateOf(currentGoals?.proteinGoal?.toInt()?.toString() ?: "150") }
    var carbs by remember { mutableStateOf(currentGoals?.carbGoal?.toInt()?.toString() ?: "250") }
    var fat by remember { mutableStateOf(currentGoals?.fatGoal?.toInt()?.toString() ?: "65") }
    var fiber by remember { mutableStateOf(currentGoals?.fiberGoal?.toInt()?.toString() ?: "30") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Goals") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GoalTextField("Calories (kcal)", calories, CaloriesBlue) { calories = it }
                GoalTextField("Protein (g)", protein, ProteinRed) { protein = it }
                GoalTextField("Carbs (g)", carbs, CarbsOrange) { carbs = it }
                GoalTextField("Fat (g)", fat, FatYellow) { fat = it }
                GoalTextField("Fiber (g)", fiber, FiberGreen) { fiber = it }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onSave(
                    Goals(
                        calorieGoal = calories.toDoubleOrNull() ?: 2000.0,
                        proteinGoal = protein.toDoubleOrNull() ?: 150.0,
                        carbGoal = carbs.toDoubleOrNull() ?: 250.0,
                        fatGoal = fat.toDoubleOrNull() ?: 65.0,
                        fiberGoal = fiber.toDoubleOrNull() ?: 30.0,
                    ),
                )
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun GoalTextField(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = color, focusedLabelColor = color),
    )
}

@Composable
fun WidgetToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

val ALL_NUTRIENT_KEYS =
    listOf(
        "saturatedFat",
        "monounsaturatedFat",
        "polyunsaturatedFat",
        "transFat",
        "cholesterol",
        "omega3",
        "omega6",
        "sugar",
        "addedSugars",
        "sugarAlcohols",
        "starch",
        "sodium",
        "potassium",
        "calcium",
        "iron",
        "magnesium",
        "phosphorus",
        "zinc",
        "copper",
        "manganese",
        "selenium",
        "iodine",
        "fluoride",
        "chromium",
        "molybdenum",
        "chloride",
        "vitaminA",
        "vitaminC",
        "vitaminD",
        "vitaminE",
        "vitaminK",
        "vitaminB1",
        "vitaminB2",
        "vitaminB3",
        "vitaminB5",
        "vitaminB6",
        "vitaminB7",
        "vitaminB9",
        "vitaminB12",
        "caffeine",
        "alcohol",
        "water",
        "salt",
    )

val NUTRIENT_CATEGORIES =
    listOf(
        "Fat Breakdown" to
            listOf(
                "saturatedFat" to "Saturated Fat",
                "monounsaturatedFat" to "Monounsaturated Fat",
                "polyunsaturatedFat" to "Polyunsaturated Fat",
                "transFat" to "Trans Fat",
                "cholesterol" to "Cholesterol",
                "omega3" to "Omega-3",
                "omega6" to "Omega-6",
            ),
        "Sugar & Carbs" to
            listOf(
                "sugar" to "Sugar",
                "addedSugars" to "Added Sugars",
                "sugarAlcohols" to "Sugar Alcohols",
                "starch" to "Starch",
            ),
        "Minerals" to
            listOf(
                "sodium" to "Sodium",
                "potassium" to "Potassium",
                "calcium" to "Calcium",
                "iron" to "Iron",
                "magnesium" to "Magnesium",
                "phosphorus" to "Phosphorus",
                "zinc" to "Zinc",
                "copper" to "Copper",
                "manganese" to "Manganese",
                "selenium" to "Selenium",
                "iodine" to "Iodine",
                "fluoride" to "Fluoride",
                "chromium" to "Chromium",
                "molybdenum" to "Molybdenum",
                "chloride" to "Chloride",
            ),
        "Vitamins" to
            listOf(
                "vitaminA" to "Vitamin A",
                "vitaminC" to "Vitamin C",
                "vitaminD" to "Vitamin D",
                "vitaminE" to "Vitamin E",
                "vitaminK" to "Vitamin K",
                "vitaminB1" to "Vitamin B1",
                "vitaminB2" to "Vitamin B2",
                "vitaminB3" to "Vitamin B3",
                "vitaminB5" to "Vitamin B5",
                "vitaminB6" to "Vitamin B6",
                "vitaminB7" to "Vitamin B7",
                "vitaminB9" to "Vitamin B9",
                "vitaminB12" to "Vitamin B12",
            ),
        "Other" to
            listOf(
                "caffeine" to "Caffeine",
                "alcohol" to "Alcohol",
                "water" to "Water",
                "salt" to "Salt",
            ),
    )
