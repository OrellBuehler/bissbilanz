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
import kotlin.math.roundToInt

@Composable
fun SettingsScreen(navController: NavController) {
    val authManager: AuthManager = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val api: BissbilanzApi = koinInject()
    val healthSync: HealthSyncService = koinInject()
    val goals by goalsRepo.goals().collectAsStateWithLifecycle(null)
    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(null)
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var customMealTypes by remember { mutableStateOf<List<MealType>>(emptyList()) }
    var editedNutrients by remember { mutableStateOf<Set<String>?>(null) }
    var nutrientsDirty by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val healthPrefs = context.getSharedPreferences("health_connect", Context.MODE_PRIVATE)
    var healthAvailable by remember { mutableStateOf(false) }
    var healthPermGranted by remember { mutableStateOf(false) }
    var healthSyncEnabled by remember { mutableStateOf(healthPrefs.getBoolean("sync_enabled", false)) }
    val tabPrefs = context.getSharedPreferences("nav_tabs", Context.MODE_PRIVATE)
    val defaultTabs = setOf("foods", "favorites", "insights")
    var selectedTabs by remember {
        mutableStateOf(tabPrefs.getStringSet("selected_tabs", defaultTabs) ?: defaultTabs)
    }
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
        goalsRepo.refresh()
        prefsRepo.refresh()
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

            // Navigation Tabs
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Navigation Tabs",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Choose 3 tabs for the bottom navigation",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    val tabOptions =
                        listOf(
                            "foods" to "Foods",
                            "favorites" to "Favorites",
                            "insights" to "Insights",
                            "weight" to "Weight",
                            "supplements" to "Supplements",
                        )

                    tabOptions.forEach { (route, label) ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = route in selectedTabs,
                                onCheckedChange = { checked ->
                                    selectedTabs = if (checked) selectedTabs + route else selectedTabs - route
                                    if (selectedTabs.size == 3) {
                                        tabPrefs.edit().putStringSet("selected_tabs", selectedTabs).apply()
                                    }
                                },
                                enabled = route in selectedTabs || selectedTabs.size < 3,
                            )
                            Text(label, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Goals section
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Daily Goals", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))

                    fun calcGrams(
                        pct: Int,
                        cals: Int,
                        calsPerGram: Int,
                    ): Int = ((pct / 100.0) * cals / calsPerGram).roundToInt()

                    fun calcPct(
                        grams: Double,
                        cals: Double,
                        calsPerGram: Int,
                    ): Int = if (cals <= 0) 0 else ((grams * calsPerGram) / cals * 100).roundToInt()

                    var editCalories by remember(goals) {
                        mutableStateOf(goals?.calorieGoal?.toInt()?.toString() ?: "2000")
                    }
                    var editProteinPct by remember(goals) {
                        mutableStateOf(
                            goals?.let { g -> calcPct(g.proteinGoal, g.calorieGoal, 4).coerceIn(5, 80) } ?: 30,
                        )
                    }
                    var editCarbsPct by remember(goals) {
                        mutableStateOf(
                            goals?.let { g -> calcPct(g.carbGoal, g.calorieGoal, 4).coerceIn(5, 80) } ?: 40,
                        )
                    }
                    var editFiberG by remember(goals) {
                        mutableStateOf(goals?.fiberGoal?.toInt() ?: 30)
                    }

                    val cals = editCalories.toIntOrNull() ?: 2000
                    val fatPct = (100 - editProteinPct - editCarbsPct).coerceAtLeast(0)
                    val totalPct = editProteinPct + editCarbsPct + fatPct
                    val isValid = totalPct == 100

                    val proteinG = calcGrams(editProteinPct, cals, 4)
                    val carbsG = calcGrams(editCarbsPct, cals, 4)
                    val fatG = calcGrams(fatPct, cals, 9)
                    val maxFiberG = carbsG.coerceAtLeast(1)

                    OutlinedTextField(
                        value = editCalories,
                        onValueChange = { editCalories = it },
                        label = { Text("Calories (kcal)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Protein: $editProteinPct% - ${proteinG}g", style = MaterialTheme.typography.bodyMedium)
                    Slider(
                        value = editProteinPct.toFloat(),
                        onValueChange = { editProteinPct = it.roundToInt() },
                        valueRange = 5f..80f,
                        steps = 74,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text("Carbs: $editCarbsPct% - ${carbsG}g", style = MaterialTheme.typography.bodyMedium)
                    Slider(
                        value = editCarbsPct.toFloat(),
                        onValueChange = { editCarbsPct = it.roundToInt() },
                        valueRange = 5f..80f,
                        steps = 74,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    GoalRow("Fat (auto)", fatG.toDouble(), "g ($fatPct%)")

                    Spacer(modifier = Modifier.height(8.dp))

                    Text("Fiber: ${editFiberG}g", style = MaterialTheme.typography.bodyMedium)
                    Slider(
                        value = editFiberG.toFloat(),
                        onValueChange = { editFiberG = it.roundToInt() },
                        valueRange = 0f..maxFiberG.toFloat(),
                        steps = (maxFiberG - 1).coerceAtLeast(0),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (isValid) Icons.Default.CheckCircle else Icons.Default.Cancel,
                                contentDescription = null,
                                tint = if (isValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "Total: $totalPct%",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            )
                        }
                        Button(
                            onClick = {
                                scope.launch {
                                    try {
                                        goalsRepo.setGoals(
                                            Goals(
                                                calorieGoal = cals.toDouble(),
                                                proteinGoal = proteinG.toDouble(),
                                                carbGoal = carbsG.toDouble(),
                                                fatGoal = fatG.toDouble(),
                                                fiberGoal = editFiberG.toDouble(),
                                            ),
                                        )
                                        snackbarHostState.showSnackbar("Goals updated")
                                    } catch (_: Exception) {
                                        snackbarHostState.showSnackbar("Failed to update goals")
                                    }
                                }
                            },
                            enabled = isValid,
                        ) {
                            Text("Save")
                        }
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
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurface)
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
