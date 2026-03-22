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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.bissbilanz.HealthSyncService
import com.bissbilanz.android.BuildConfig
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.model.Goals
import com.bissbilanz.model.PreferencesUpdate
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.roundToInt
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

@Composable
fun SettingsScreen(navController: NavController) {
    val viewModel: SettingsViewModel = koinViewModel()
    val healthSync: HealthSyncService = koinInject()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val customMealTypes by viewModel.customMealTypes.collectAsStateWithLifecycle()
    val healthAvailable by viewModel.healthAvailable.collectAsStateWithLifecycle()
    val healthPermGranted by viewModel.healthPermGranted.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var editedNutrients by remember { mutableStateOf<Set<String>?>(null) }
    var nutrientsDirty by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val healthPrefs = context.getSharedPreferences("health_connect", Context.MODE_PRIVATE)
    var healthSyncEnabled by remember { mutableStateOf(healthPrefs.getBoolean("sync_enabled", false)) }
    val tabPrefs = context.getSharedPreferences("nav_tabs", Context.MODE_PRIVATE)
    var selectedTabs by remember {
        mutableStateOf(
            tabPrefs.getStringSet("selected_tabs", com.bissbilanz.android.navigation.defaultTabRoutes)
                ?: com.bissbilanz.android.navigation.defaultTabRoutes,
        )
    }
    val permissionLauncher =
        rememberLauncherForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
        ) {
            viewModel.refreshHealthPermissions()
        }

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }

    LaunchedEffect(prefs) {
        if (editedNutrients == null && prefs != null) {
            editedNutrients = prefs!!.visibleNutrients.toSet()
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
                        viewModel.addMealType(newMealName.trim())
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
        PullToRefreshWrapper(
            onRefresh = { viewModel.refreshAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
            ) {
                Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))

                // Navigation items
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        SettingsNavItem("Weight Log", Icons.Default.MonitorWeight) {
                            if ("weight" in selectedTabs) {
                                navController.navigate("weight") {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            } else {
                                navController.navigate("weight")
                            }
                        }
                        HorizontalDivider()
                        SettingsNavItem("Supplements", Icons.Default.Medication) {
                            if ("supplements" in selectedTabs) {
                                navController.navigate("supplements") {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            } else {
                                navController.navigate("supplements")
                            }
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
                            val isSelected = route in selectedTabs
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = isSelected,
                                    onCheckedChange = { checked ->
                                        haptic(HapticFeedbackType.LongPress)
                                        val updated = if (checked) selectedTabs + route else selectedTabs - route
                                        if (updated.size in 1..5) {
                                            selectedTabs = updated
                                            if (updated.size == 3) {
                                                tabPrefs.edit().putStringSet("selected_tabs", updated).apply()
                                            }
                                        }
                                    },
                                    enabled = if (isSelected) selectedTabs.size >= 3 else selectedTabs.size < 3,
                                )
                                Text(label, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        if (selectedTabs.size != 3) {
                            Text(
                                "Select exactly 3 tabs (${selectedTabs.size}/3)",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(top = 4.dp),
                            )
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
                                    viewModel.setGoals(
                                        Goals(
                                            calorieGoal = cals.toDouble(),
                                            proteinGoal = proteinG.toDouble(),
                                            carbGoal = carbsG.toDouble(),
                                            fatGoal = fatG.toDouble(),
                                            fiberGoal = editFiberG.toDouble(),
                                        ),
                                    )
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
                                        haptic(HapticFeedbackType.LongPress)
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
                                viewModel.updatePreference(PreferencesUpdate(showChartWidget = value))
                            }
                            WidgetToggle("Favorites", p.showFavoritesWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showFavoritesWidget = value))
                            }
                            WidgetToggle("Supplements", p.showSupplementsWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showSupplementsWidget = value))
                            }
                            WidgetToggle("Weight", p.showWeightWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showWeightWidget = value))
                            }
                            WidgetToggle("Meal Breakdown", p.showMealBreakdownWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showMealBreakdownWidget = value))
                            }
                            WidgetToggle("Top Foods", p.showTopFoodsWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showTopFoodsWidget = value))
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
                                        viewModel.updateFavoriteMealAssignmentMode(
                                            GenPreferencesUpdate.FavoriteMealAssignmentMode.time_based,
                                        )
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
                                        viewModel.updateFavoriteMealAssignmentMode(
                                            GenPreferencesUpdate.FavoriteMealAssignmentMode.ask_meal,
                                        )
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
                                                    haptic(HapticFeedbackType.LongPress)
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
                                        viewModel.updateVisibleNutrients(editedNutrients?.toList() ?: emptyList())
                                        nutrientsDirty = false
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
                            onClick = { viewModel.logout() },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        ) {
                            Text("Sign out")
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "Version ${BuildConfig.VERSION_NAME}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
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
    val haptic = rememberHaptic()
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label)
        Switch(
            checked = checked,
            onCheckedChange = { value ->
                haptic(HapticFeedbackType.LongPress)
                onCheckedChange(value)
            },
        )
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
