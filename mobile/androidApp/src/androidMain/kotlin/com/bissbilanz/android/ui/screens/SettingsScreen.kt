package com.bissbilanz.android.ui.screens

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.bissbilanz.android.BuildConfig
import com.bissbilanz.android.R
import com.bissbilanz.android.health.HealthConnectService
import com.bissbilanz.android.reminders.SupplementReminderPreferences
import com.bissbilanz.android.sync.AccountDowngradeController
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.CheckboxRow
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.ToggleRow
import com.bissbilanz.android.ui.openNotificationSettings
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.AuthState
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Goals
import com.bissbilanz.model.PreferencesUpdate
import com.bissbilanz.sync.SyncManager
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.roundToInt
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: NavController) {
    val viewModel: SettingsViewModel = koinViewModel()
    val authManager: AuthManager = koinInject()
    val syncManager: SyncManager = koinInject()
    val healthConnect: HealthConnectService = koinInject()
    val healthAvailable = remember { healthConnect.isAvailable() }
    val syncState by syncManager.state.collectAsStateWithLifecycle()
    val pendingSyncCount = syncState.pendingCount
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val isLocalMode = mode == AppMode.LOCAL
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val customMealTypes by viewModel.customMealTypes.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarMessageRes by viewModel.snackbarMessageRes.collectAsStateWithLifecycle()
    val biologicalSex by viewModel.biologicalSex.collectAsStateWithLifecycle()
    val authState by authManager.authState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    var showMealTypeDialog by remember { mutableStateOf(false) }
    var showDeleteAccountDialog by remember { mutableStateOf(false) }
    var showDowngradeDialog by remember { mutableStateOf(false) }
    val downgradeState by viewModel.downgradeState.collectAsStateWithLifecycle()
    var editedNutrients by remember { mutableStateOf<Set<String>?>(null) }
    var nutrientsDirty by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
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
    // Resolved in composition rather than with context.getString inside the effect:
    // a Context read is not configuration-aware, so an app-language change would show
    // the previous locale's text.
    val snackbarMessageText = snackbarMessageRes?.let { stringResource(it) }
    LaunchedEffect(snackbarMessageText) {
        snackbarMessageText?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbarRes()
        }
    }

    val exportingData by viewModel.exportingData.collectAsStateWithLifecycle()
    val exportedFile by viewModel.exportedFile.collectAsStateWithLifecycle()
    LaunchedEffect(exportedFile) {
        exportedFile?.let { file ->
            val uri =
                androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file,
                )
            val intent =
                android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                    type = "application/zip"
                    putExtra(android.content.Intent.EXTRA_STREAM, uri)
                    addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            context.startActivity(android.content.Intent.createChooser(intent, null))
            viewModel.clearExportedFile()
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

    if (showDeleteAccountDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteAccountDialog = false },
            title = { Text(stringResource(R.string.settings_delete_account_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.settings_delete_account_message))
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = {
                            showDeleteAccountDialog = false
                            showDowngradeDialog = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.settings_downgrade_option))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { viewModel.exportData(context.cacheDir) },
                        enabled = !exportingData,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.settings_export_first))
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteAccountDialog = false
                    viewModel.deleteAccount()
                }) {
                    Text(
                        stringResource(R.string.settings_delete_account_confirm),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteAccountDialog = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        )
    }

    if (showDowngradeDialog) {
        val downgradeInProgress =
            downgradeState == AccountDowngradeController.State.Syncing ||
                downgradeState == AccountDowngradeController.State.Downloading ||
                downgradeState == AccountDowngradeController.State.Deleting
        AlertDialog(
            onDismissRequest = {
                if (!downgradeInProgress) {
                    showDowngradeDialog = false
                    viewModel.resetDowngrade()
                }
            },
            title = { Text(stringResource(R.string.settings_downgrade_title)) },
            text = {
                Column {
                    when (val state = downgradeState) {
                        AccountDowngradeController.State.Idle ->
                            Text(stringResource(R.string.settings_downgrade_message))
                        is AccountDowngradeController.State.Failed -> {
                            Text(stringResource(R.string.settings_downgrade_message))
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(stringResource(state.messageRes), color = MaterialTheme.colorScheme.error)
                        }
                        AccountDowngradeController.State.Done ->
                            Text(stringResource(R.string.settings_downgrade_done))
                        else ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    stringResource(
                                        when (downgradeState) {
                                            AccountDowngradeController.State.Syncing ->
                                                R.string.settings_downgrade_progress_sync
                                            AccountDowngradeController.State.Deleting ->
                                                R.string.settings_downgrade_progress_delete
                                            else -> R.string.settings_downgrade_progress_download
                                        },
                                    ),
                                )
                            }
                    }
                }
            },
            confirmButton = {
                when {
                    downgradeState == AccountDowngradeController.State.Done ->
                        TextButton(onClick = {
                            showDowngradeDialog = false
                            viewModel.resetDowngrade()
                        }) { Text(stringResource(R.string.settings_downgrade_close)) }
                    downgradeInProgress -> {}
                    else ->
                        TextButton(onClick = { viewModel.downgradeToLocal() }) {
                            Text(stringResource(R.string.settings_downgrade_confirm))
                        }
                }
            },
            dismissButton = {
                if (!downgradeInProgress && downgradeState != AccountDowngradeController.State.Done) {
                    TextButton(onClick = {
                        showDowngradeDialog = false
                        viewModel.resetDowngrade()
                    }) { Text(stringResource(R.string.dialog_cancel)) }
                }
            },
        )
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = { AppTopBar(stringResource(R.string.settings_title), scrollBehavior) },
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
                        SettingsNavItem(stringResource(R.string.sleep_section_title), Icons.Default.Bedtime) {
                            navController.navigate("sleep")
                        }
                        HorizontalDivider()
                        SettingsNavItem(stringResource(R.string.fasting_title), Icons.Default.Timer) {
                            navController.navigate("fasting")
                        }
                        if (healthAvailable) {
                            HorizontalDivider()
                            SettingsNavItem(stringResource(R.string.health_connect_title), Icons.Default.Favorite) {
                                navController.navigate("health")
                            }
                        }
                        HorizontalDivider()
                        SettingsNavItem(stringResource(R.string.recipe_list_title), Icons.AutoMirrored.Filled.MenuBook) {
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
                            // The queue only exists server-side — the assistant reaches it
                            // over MCP — so it has no meaning in Local mode.
                            HorizontalDivider()
                            SettingsNavItem(stringResource(R.string.ai_tasks_title), Icons.Default.AutoAwesome) {
                                navController.navigate("ai-tasks")
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
                            CheckboxRow(
                                label = label,
                                checked = isSelected,
                                enabled = if (isSelected) selectedTabs.size >= 3 else selectedTabs.size < 3,
                                onCheckedChange = { checked ->
                                    val updated = if (checked) selectedTabs + route else selectedTabs - route
                                    if (updated.size in 1..5) {
                                        selectedTabs = updated
                                        if (updated.size == 3) {
                                            tabPrefs.edit().putStringSet("selected_tabs", updated).apply()
                                        }
                                    }
                                },
                            )
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

                // Biological sex — sits with the goals because that is what it feeds:
                // the nutrient-gap analytics pick sex-specific reference intakes.
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.settings_biological_sex),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.settings_biological_sex_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        val sexOptions =
                            listOf(
                                stringResource(R.string.settings_biological_sex_unset) to null,
                                stringResource(R.string.settings_biological_sex_male) to
                                    GenPreferencesUpdate.BiologicalSex.male,
                                stringResource(R.string.settings_biological_sex_female) to
                                    GenPreferencesUpdate.BiologicalSex.female,
                            )
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                            sexOptions.forEachIndexed { index, (label, value) ->
                                SegmentedButton(
                                    shape = SegmentedButtonDefaults.itemShape(index, sexOptions.size),
                                    onClick = { viewModel.updateBiologicalSex(value) },
                                    selected = biologicalSex == value?.value,
                                ) {
                                    Text(label)
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LanguageCard()

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
                            WidgetToggle(stringResource(R.string.sleep_section_title), p.showSleepWidget) { value ->
                                viewModel.updatePreference(PreferencesUpdate(showSleepWidget = value))
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

                    SupplementRemindersCard()

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
                                        CheckboxRow(
                                            label = label,
                                            checked = key in selected,
                                            onCheckedChange = { checked ->
                                                editedNutrients = if (checked) selected + key else selected - key
                                                nutrientsDirty = true
                                            },
                                        )
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
                            // A dead session leaves the app fully usable on cached data,
                            // so it is stated here rather than only as a passing toast —
                            // the same warning row plus sign-in action iOS shows. Keyed on
                            // "not signed in" rather than on SessionExpired alone: the
                            // refresh already deleted both tokens, so after a restart the
                            // same stranded user reads as Unauthenticated with a Synced
                            // mode, and would otherwise have no way back in.
                            if (authState !is AuthState.Authenticated && authState !is AuthState.Refreshing) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(verticalAlignment = Alignment.Top) {
                                    Icon(
                                        Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        stringResource(R.string.session_expired_message),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Button(
                                    onClick = { launchLoginFlow(context, authManager) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(stringResource(R.string.settings_sign_in_again))
                                }
                            }
                            // Queued offline writes: surfaced here (and only when
                            // there are any) so a stalled upload is visible instead
                            // of silently sitting in the queue.
                            if (pendingSyncCount > 0) {
                                Spacer(modifier = Modifier.height(8.dp))
                                SettingsNavItem(
                                    stringResource(R.string.pending_sync_row, pendingSyncCount),
                                    Icons.Default.Sync,
                                ) {
                                    navController.navigate("pending-sync")
                                }
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedButton(
                                onClick = { viewModel.exportData(context.cacheDir) },
                                enabled = !exportingData,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                if (exportingData) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                Text(stringResource(R.string.settings_export_data))
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = { viewModel.logout() },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            ) {
                                Text(stringResource(R.string.settings_sign_out))
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            TextButton(
                                onClick = { showDeleteAccountDialog = true },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            ) {
                                Text(stringResource(R.string.settings_delete_account))
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
                TextButton(
                    onClick = { uriHandler.openUri("https://bissbilanz.orellbuehler.ch/privacy") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        stringResource(R.string.settings_privacy_policy),
                        style = MaterialTheme.typography.bodySmall,
                    )
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
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        headlineContent = { Text(title) },
        // Both icons only restate the row's own label, so they stay decorative
        // rather than making TalkBack announce every row three times.
        leadingContent = { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                null,
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
    ToggleRow(label = label, checked = checked, onCheckedChange = onCheckedChange)
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

/**
 * In-app language override, the Android counterpart of the iOS English/Deutsch picker.
 *
 * Device-local, not a server preference: which language the phone speaks is a property of
 * the phone. On API 33+ the choice is handed to the platform's per-app language and also
 * appears in Android's own app settings; below that it is stored locally and applied by
 * rebuilding the activity, which is why picking a language restarts this screen there.
 */
@Composable
private fun LanguageCard() {
    val context = LocalContext.current
    var selected by remember { mutableStateOf(AppLanguage.stored(context)) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_language),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            val options =
                listOf(
                    AppLanguage.SYSTEM to stringResource(R.string.settings_language_system),
                    "en" to stringResource(R.string.settings_language_english),
                    "de" to stringResource(R.string.settings_language_german),
                )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                options.forEachIndexed { index, (tag, label) ->
                    SegmentedButton(
                        shape = SegmentedButtonDefaults.itemShape(index, options.size),
                        onClick = {
                            if (tag == selected) return@SegmentedButton
                            selected = tag
                            AppLanguage.applyAndRefresh(context, tag)
                        },
                        selected = selected == tag,
                    ) {
                        Text(label)
                    }
                }
            }
        }
    }
}

/**
 * Snooze duration for supplement reminders, plus the notification-permission status.
 *
 * Device-local (SharedPreferences), not a server preference: how long a snooze lasts is a
 * property of the phone you're being reminded on. Presets rather than a free-text field —
 * there is nothing to parse, clamp or reject, and it stays parallel with iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SupplementRemindersCard() {
    val context = LocalContext.current
    val reminderPrefs: SupplementReminderPreferences = koinInject()
    var snoozeMinutes by remember { mutableIntStateOf(reminderPrefs.snoozeMinutes) }
    var expanded by remember { mutableStateOf(false) }
    val notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()

    @Composable
    fun label(minutes: Int) =
        if (minutes % 60 == 0 && minutes >= 60) {
            stringResource(R.string.settings_snooze_hours, minutes / 60)
        } else {
            stringResource(R.string.settings_snooze_minutes, minutes)
        }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_reminders_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))

            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = it },
            ) {
                OutlinedTextField(
                    value = label(snoozeMinutes),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.settings_snooze_duration)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier =
                        Modifier
                            .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    SupplementReminderPreferences.SNOOZE_PRESETS.forEach { minutes ->
                        DropdownMenuItem(
                            text = { Text(label(minutes)) },
                            onClick = {
                                snoozeMinutes = minutes
                                reminderPrefs.snoozeMinutes = minutes
                                expanded = false
                            },
                        )
                    }
                }
            }

            if (!notificationsEnabled) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    stringResource(R.string.settings_reminders_permission_missing),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                TextButton(onClick = { openNotificationSettings(context) }) {
                    Text(stringResource(R.string.settings_reminders_permission_grant))
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(R.string.settings_reminders_delay_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
