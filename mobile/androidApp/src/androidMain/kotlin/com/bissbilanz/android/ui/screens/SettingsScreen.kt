package com.bissbilanz.android.ui.screens

import android.content.Context
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.bissbilanz.android.BuildConfig
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Goals
import com.bissbilanz.model.PreferencesUpdate
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.roundToInt
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

@Composable
fun SettingsScreen(navController: NavController) {
    val viewModel: SettingsViewModel = koinViewModel()
    val authManager: AuthManager = koinInject()
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val isLocalMode = mode == AppMode.LOCAL
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val customMealTypes by viewModel.customMealTypes.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var editedNutrients by remember { mutableStateOf<Set<String>?>(null) }
    var nutrientsDirty by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val tabPrefs = context.getSharedPreferences("nav_tabs", Context.MODE_PRIVATE)
    var selectedTabs by remember {
        mutableStateOf(
            tabPrefs.getStringSet("selected_tabs", com.bissbilanz.android.navigation.defaultTabRoutes)
                ?: com.bissbilanz.android.navigation.defaultTabRoutes,
        )
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
            title = { Text(stringResource(R.string.settings_add_meal_type_title)) },
            text = {
                OutlinedTextField(
                    value = newMealName,
                    onValueChange = { newMealName = it },
                    label = { Text(stringResource(R.string.settings_meal_type_name)) },
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
                }) { Text(stringResource(R.string.action_add)) }
            },
            dismissButton = {
                TextButton(onClick = { showMealTypeDialog = false }) { Text(stringResource(R.string.dialog_cancel)) }
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
                Text(stringResource(R.string.settings_title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))

                // Navigation items
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        SettingsNavItem(stringResource(R.string.weight_screen_title), Icons.Default.MonitorWeight) {
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
                        SettingsNavItem(stringResource(R.string.chart_supplements), Icons.Default.Medication) {
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
                        SettingsNavItem(stringResource(R.string.recipe_list_title), Icons.Default.MenuBook) {
                            navController.navigate("recipes")
                        }
                        HorizontalDivider()
                        SettingsNavItem(stringResource(R.string.settings_nav_calendar), Icons.Default.CalendarMonth) {
                            navController.navigate("calendar")
                        }
                        if (!isLocalMode) {
                            HorizontalDivider()
                            SettingsNavItem(stringResource(R.string.maintenance_title), Icons.Default.Calculate) {
                                navController.navigate("maintenance")
                            }
                        }
                        HorizontalDivider()
                        SettingsNavItem(stringResource(R.string.settings_nav_insights), Icons.Default.BarChart) {
                            if ("insights" in selectedTabs) {
                                navController.navigate("insights") {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            } else {
                                navController.navigate("insights")
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Navigation Tabs
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.settings_nav_tabs),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.settings_nav_tabs_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        val tabOptions =
                            listOf(
                                "foods" to stringResource(R.string.settings_tab_foods),
                                "favorites" to stringResource(R.string.favorites_title),
                                "insights" to stringResource(R.string.settings_nav_insights),
                                "weight" to stringResource(R.string.weight_widget_title),
                                "supplements" to stringResource(R.string.chart_supplements),
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
                                stringResource(R.string.settings_select_exactly_3_tabs, selectedTabs.size),
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
                        Text(
                            stringResource(R.string.settings_daily_goals),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
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
                            label = { Text(stringResource(R.string.settings_calories_kcal)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            stringResource(R.string.settings_protein_pct_grams, editProteinPct, proteinG),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Slider(
                            value = editProteinPct.toFloat(),
                            onValueChange = { editProteinPct = it.roundToInt() },
                            valueRange = 5f..80f,
                            steps = 74,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            stringResource(R.string.settings_carbs_pct_grams, editCarbsPct, carbsG),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Slider(
                            value = editCarbsPct.toFloat(),
                            onValueChange = { editCarbsPct = it.roundToInt() },
                            valueRange = 5f..80f,
                            steps = 74,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        GoalRow(
                            stringResource(R.string.settings_fat_auto),
                            fatG.toDouble(),
                            stringResource(R.string.settings_fat_unit_pct, fatPct),
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(stringResource(R.string.settings_fiber_grams, editFiberG), style = MaterialTheme.typography.bodyMedium)
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
                                    stringResource(R.string.settings_total_pct, totalPct),
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
                                Text(stringResource(R.string.weight_save))
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Custom meal types (server-only, hidden in Local mode)
                if (!isLocalMode) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    stringResource(R.string.settings_custom_meal_types),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                IconButton(onClick = { showMealTypeDialog = true }) {
                                    Icon(Icons.Default.Add, stringResource(R.string.settings_add_meal_type))
                                }
                            }
                            if (customMealTypes.isEmpty()) {
                                Text(
                                    stringResource(R.string.settings_default_meals_only),
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
                }

                // Dashboard Widgets
                prefs?.let { p ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.settings_dashboard_widgets),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            WidgetToggle(stringResource(R.string.settings_widget_chart), p.showChartWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showChartWidget = value))
                            }
                            WidgetToggle(stringResource(R.string.favorites_title), p.showFavoritesWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showFavoritesWidget = value))
                            }
                            WidgetToggle(stringResource(R.string.chart_supplements), p.showSupplementsWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showSupplementsWidget = value))
                            }
                            WidgetToggle(stringResource(R.string.weight_widget_title), p.showWeightWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showWeightWidget = value))
                            }
                            WidgetToggle(stringResource(R.string.settings_widget_meal_breakdown), p.showMealBreakdownWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showMealBreakdownWidget = value))
                            }
                            WidgetToggle(stringResource(R.string.settings_widget_top_foods), p.showTopFoodsWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showTopFoodsWidget = value))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Favorite Logging
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.settings_favorite_logging),
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
                                Text(stringResource(R.string.settings_auto_assign_by_time))
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
                                Text(stringResource(R.string.settings_always_ask))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Visible Nutrients
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.settings_visible_nutrients),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.settings_visible_nutrients_desc),
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
                                ) { Text(stringResource(R.string.settings_select_all)) }
                                OutlinedButton(
                                    onClick = {
                                        editedNutrients = emptySet()
                                        nutrientsDirty = true
                                    },
                                    modifier = Modifier.weight(1f),
                                ) { Text(stringResource(R.string.settings_deselect_all)) }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            editedNutrients?.let { selected ->
                                nutrientCategories().forEach { (category, nutrients) ->
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
                                ) { Text(stringResource(R.string.weight_save)) }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Account
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.settings_account),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (isLocalMode) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.settings_local_mode_desc),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { launchLoginFlow(context, authManager) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(stringResource(R.string.settings_sign_in_to_sync))
                            }
                        } else {
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedButton(
                                onClick = { viewModel.logout() },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            ) {
                                Text(stringResource(R.string.settings_sign_out))
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
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
        trailingContent = {
            Icon(
                Icons.AutoMirrored.Filled.ArrowForward,
                stringResource(R.string.settings_nav_go),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
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

@Composable
fun nutrientCategories() =
    listOf(
        stringResource(R.string.nutrient_category_fat_breakdown) to
            listOf(
                "saturatedFat" to stringResource(R.string.nutrient_saturated_fat),
                "monounsaturatedFat" to stringResource(R.string.nutrient_monounsaturated_fat_full),
                "polyunsaturatedFat" to stringResource(R.string.nutrient_polyunsaturated_fat_full),
                "transFat" to stringResource(R.string.nutrient_trans_fat),
                "cholesterol" to stringResource(R.string.nutrient_cholesterol),
                "omega3" to stringResource(R.string.nutrient_omega3),
                "omega6" to stringResource(R.string.nutrient_omega6),
            ),
        stringResource(R.string.nutrient_category_sugar_carb) to
            listOf(
                "sugar" to stringResource(R.string.nutrient_sugar),
                "addedSugars" to stringResource(R.string.nutrient_added_sugars),
                "sugarAlcohols" to stringResource(R.string.nutrient_sugar_alcohols),
                "starch" to stringResource(R.string.nutrient_starch),
            ),
        stringResource(R.string.nutrient_category_mineral) to
            listOf(
                "sodium" to stringResource(R.string.nutrient_sodium),
                "potassium" to stringResource(R.string.nutrient_potassium),
                "calcium" to stringResource(R.string.nutrient_calcium),
                "iron" to stringResource(R.string.nutrient_iron),
                "magnesium" to stringResource(R.string.nutrient_magnesium),
                "phosphorus" to stringResource(R.string.nutrient_phosphorus),
                "zinc" to stringResource(R.string.nutrient_zinc),
                "copper" to stringResource(R.string.nutrient_copper),
                "manganese" to stringResource(R.string.nutrient_manganese),
                "selenium" to stringResource(R.string.nutrient_selenium),
                "iodine" to stringResource(R.string.nutrient_iodine),
                "fluoride" to stringResource(R.string.nutrient_fluoride),
                "chromium" to stringResource(R.string.nutrient_chromium),
                "molybdenum" to stringResource(R.string.nutrient_molybdenum),
                "chloride" to stringResource(R.string.nutrient_chloride),
            ),
        stringResource(R.string.nutrient_category_vitamin) to
            listOf(
                "vitaminA" to stringResource(R.string.nutrient_vitamin_a),
                "vitaminC" to stringResource(R.string.nutrient_vitamin_c),
                "vitaminD" to stringResource(R.string.nutrient_vitamin_d),
                "vitaminE" to stringResource(R.string.nutrient_vitamin_e),
                "vitaminK" to stringResource(R.string.nutrient_vitamin_k),
                "vitaminB1" to stringResource(R.string.nutrient_vitamin_b1),
                "vitaminB2" to stringResource(R.string.nutrient_vitamin_b2),
                "vitaminB3" to stringResource(R.string.nutrient_vitamin_b3),
                "vitaminB5" to stringResource(R.string.nutrient_vitamin_b5),
                "vitaminB6" to stringResource(R.string.nutrient_vitamin_b6),
                "vitaminB7" to stringResource(R.string.nutrient_vitamin_b7),
                "vitaminB9" to stringResource(R.string.nutrient_vitamin_b9),
                "vitaminB12" to stringResource(R.string.nutrient_vitamin_b12),
            ),
        stringResource(R.string.nutrient_category_other) to
            listOf(
                "caffeine" to stringResource(R.string.nutrient_caffeine),
                "alcohol" to stringResource(R.string.nutrient_alcohol),
                "water" to stringResource(R.string.nutrient_water),
                "salt" to stringResource(R.string.nutrient_salt),
            ),
    )
