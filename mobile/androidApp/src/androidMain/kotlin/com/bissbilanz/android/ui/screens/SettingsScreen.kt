package com.bissbilanz.android.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.health.HealthConnectService
import com.bissbilanz.android.tips.TipStore
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.ui.viewmodels.SettingsViewModel
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncManager
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: NavController) {
    val viewModel: SettingsViewModel = koinViewModel()
    val authManager: AuthManager = koinInject()
    val syncManager: SyncManager = koinInject()
    val healthConnect: HealthConnectService = koinInject()
    val healthAvailable = remember { healthConnect.isAvailable() }
    val syncState by syncManager.state.collectAsStateWithLifecycle()
    val pendingSyncCount = syncState.pendingCount + syncState.failedCount
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val isLocalMode = mode == AppMode.LOCAL
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val customMealTypes by viewModel.customMealTypes.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarMessageRes by viewModel.snackbarMessageRes.collectAsStateWithLifecycle()
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
    val tipStore: TipStore = koinInject()
    val scope = rememberCoroutineScope()
    val tipsResetMessage = stringResource(R.string.settings_tips_reset_message)
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
            com.bissbilanz.android.ui.util
                .shareFile(context, file, "application/zip")
            viewModel.clearExportedFile()
        }
    }

    LaunchedEffect(prefs) {
        if (editedNutrients == null && prefs != null) {
            editedNutrients = prefs!!.visibleNutrients.toSet()
        }
    }

    if (showMealTypeDialog) {
        AddMealTypeDialog(
            onAdd = { viewModel.addMealType(it) },
            onDismiss = { showMealTypeDialog = false },
        )
    }

    if (showDeleteAccountDialog) {
        DeleteAccountDialog(
            exportingData = exportingData,
            onDowngrade = {
                showDeleteAccountDialog = false
                showDowngradeDialog = true
            },
            onExportData = { viewModel.exportData(context.cacheDir) },
            onConfirmDelete = {
                showDeleteAccountDialog = false
                viewModel.deleteAccount()
            },
            onDismiss = { showDeleteAccountDialog = false },
        )
    }

    if (showDowngradeDialog) {
        DowngradeDialog(
            downgradeState = downgradeState,
            onConfirm = { viewModel.downgradeToLocal() },
            onClose = {
                showDowngradeDialog = false
                viewModel.resetDowngrade()
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
                SettingsNavigationCard(navController, selectedTabs, isLocalMode, healthAvailable)

                Spacer(modifier = Modifier.height(12.dp))

                NavigationTabsCard(
                    selectedTabs = selectedTabs,
                    onSelectedTabsChange = { selectedTabs = it },
                    tabPrefs = tabPrefs,
                )

                Spacer(modifier = Modifier.height(12.dp))

                DailyGoalsCard(goals = goals, onSave = { viewModel.setGoals(it) })

                Spacer(modifier = Modifier.height(12.dp))

                BiologicalSexCard(prefs = prefs, onSelect = { viewModel.updateBiologicalSex(it) })

                Spacer(modifier = Modifier.height(12.dp))

                ActivityGoalAdjustmentCard(
                    prefs = prefs,
                    onAdjustmentChange = { viewModel.updateActivityGoalAdjustment(it) },
                    onCreditPercentChange = { viewModel.updateActivityCreditPercent(it) },
                )

                Spacer(modifier = Modifier.height(12.dp))

                if (!isLocalMode) {
                    AiTaskProcessorCard(
                        prefs = prefs,
                        onProcessorChange = { viewModel.updateAiTaskProcessor(it) },
                        onAutoLogChange = { viewModel.updateAiTaskAutoLog(it) },
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                }

                WaterGoalCard(waterGoalMl = prefs?.waterGoalMl, onUpdate = { viewModel.updateWaterGoal(it) })

                Spacer(modifier = Modifier.height(12.dp))

                LanguageCard()

                Spacer(modifier = Modifier.height(12.dp))

                // Custom meal types (server-only, hidden in Local mode)
                if (!isLocalMode) {
                    CustomMealTypesCard(
                        customMealTypes = customMealTypes,
                        onAddClick = { showMealTypeDialog = true },
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                }

                prefs?.let { p ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        SettingsNavItem(stringResource(R.string.dashboard_layout_title), Icons.Outlined.Tune) {
                            navController.navigate("dashboard-layout")
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Card(modifier = Modifier.fillMaxWidth()) {
                        SettingsNavItem(stringResource(R.string.reminders_title), Icons.Default.NotificationsActive) {
                            navController.navigate("reminders")
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    FavoriteLoggingCard(
                        mode = p.favoriteMealAssignmentMode,
                        onModeChange = { viewModel.updateFavoriteMealAssignmentMode(it) },
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    VisibleNutrientsCard(
                        selected = editedNutrients,
                        dirty = nutrientsDirty,
                        onSelectionChange = {
                            editedNutrients = it
                            nutrientsDirty = true
                        },
                        onSave = {
                            viewModel.updateVisibleNutrients(editedNutrients?.toList() ?: emptyList())
                            nutrientsDirty = false
                        },
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                }

                AccountCard(
                    navController = navController,
                    isLocalMode = isLocalMode,
                    authState = authState,
                    pendingSyncCount = pendingSyncCount,
                    exportingData = exportingData,
                    onSignIn = { launchLoginFlow(context, authManager) },
                    onExportData = { viewModel.exportData(context.cacheDir) },
                    onSignOut = { viewModel.logout() },
                    onDeleteAccount = { showDeleteAccountDialog = true },
                )

                SettingsFooter(
                    onShowTipsAgain = {
                        tipStore.resetAll()
                        scope.launch { snackbarHostState.showSnackbar(tipsResetMessage) }
                    },
                )
            }
        }
    }
}
