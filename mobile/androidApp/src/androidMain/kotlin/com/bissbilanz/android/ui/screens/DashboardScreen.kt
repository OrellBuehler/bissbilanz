package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.NAV_KEY_CREATE_FOOD_BARCODE
import com.bissbilanz.android.ui.components.AddFoodSheet
import com.bissbilanz.android.ui.components.AiMealSheet
import com.bissbilanz.android.ui.components.CalorieTrendWidget
import com.bissbilanz.android.ui.components.DashboardSkeleton
import com.bissbilanz.android.ui.components.EntryEditSheet
import com.bissbilanz.android.ui.components.FastingCard
import com.bissbilanz.android.ui.components.FavoritesQuickLogWidget
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealBreakdownWidget
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.SleepWidget
import com.bissbilanz.android.ui.components.SupplementsWidget
import com.bissbilanz.android.ui.components.TopFoodsWidget
import com.bissbilanz.android.ui.components.WeightWidget
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.util.DefaultGoals
import com.bissbilanz.util.mealTypes
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedFiber
import com.bissbilanz.util.resolvedProtein
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.time.Clock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val viewModel: DashboardViewModel = koinViewModel()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val selectedDate by viewModel.selectedDate.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val refreshFailed by viewModel.refreshFailed.collectAsStateWithLifecycle()

    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val appModeManager: AppModeManager = koinInject()
    val appMode by appModeManager.mode.collectAsStateWithLifecycle(null)
    val isLocalMode = appMode == AppMode.LOCAL
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val haptic = rememberHaptic()

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }
    val aiQueuedMessage = stringResource(R.string.ai_task_queued)
    val copyFailedMessage = stringResource(R.string.dashboard_copy_failed)
    val copiedFormat = stringResource(R.string.dashboard_copied_count)
    val loggedFormat = stringResource(R.string.dashboard_favorite_logged)
    val copyEntries = {
        viewModel.copyEntriesFromYesterday({ count -> copiedFormat.format(count) }, copyFailedMessage)
    }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var showQuickAddSheet by remember { mutableStateOf(false) }
    var showAiMealSheet by remember { mutableStateOf(false) }
    var createFoodBarcode by remember { mutableStateOf<String?>(null) }
    var addFoodForMeal by remember { mutableStateOf<String?>(null) }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    LaunchedEffect(navBackStackEntry) {
        val barcode = navBackStackEntry?.savedStateHandle?.remove<String>(NAV_KEY_CREATE_FOOD_BARCODE)
        if (barcode != null) {
            createFoodBarcode = barcode
        }
    }

    val totalCalories = remember(entries) { entries.sumOf { it.resolvedCalories() } }
    val totalProtein = remember(entries) { entries.sumOf { it.resolvedProtein() } }
    val totalCarbs = remember(entries) { entries.sumOf { it.resolvedCarbs() } }
    val totalFat = remember(entries) { entries.sumOf { it.resolvedFat() } }
    val totalFiber = remember(entries) { entries.sumOf { it.resolvedFiber() } }

    val dateLabel = dayLabel(selectedDate)

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            // Centre-aligned because the title is the middle of a prev/next day
            // stepper; it is the same small top app bar the rest of the app uses.
            CenterAlignedTopAppBar(
                title = { Text(dateLabel, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = {
                        haptic(HapticFeedbackType.LongPress)
                        viewModel.previousDay()
                    }) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            stringResource(R.string.dashboard_previous_day),
                        )
                    }
                },
                actions = {
                    if (selectedDate != today) {
                        TextButton(onClick = { viewModel.goToToday() }) {
                            Text(stringResource(R.string.dashboard_go_to_today))
                        }
                    }
                    IconButton(
                        onClick = {
                            haptic(HapticFeedbackType.LongPress)
                            viewModel.nextDay()
                        },
                        // No future days — today is the last one.
                        enabled = selectedDate < today,
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            stringResource(R.string.dashboard_next_day),
                        )
                    }
                },
                scrollBehavior = scrollBehavior,
            )
        },
        floatingActionButton = {
            Column {
                // Queuing a meal for the assistant needs the server, so it is
                // hidden in local mode — same rule as iOS.
                if (!isLocalMode) {
                    SmallFloatingActionButton(
                        onClick = {
                            haptic(HapticFeedbackType.LongPress)
                            showAiMealSheet = true
                        },
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                    ) {
                        Icon(Icons.Default.AutoAwesome, stringResource(R.string.ai_task_content_desc))
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }
                SmallFloatingActionButton(
                    onClick = {
                        haptic(HapticFeedbackType.LongPress)
                        navController.navigate("scanner")
                    },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Icon(Icons.Default.QrCodeScanner, stringResource(R.string.scan_widget_content_desc))
                }
                Spacer(modifier = Modifier.height(12.dp))
                FloatingActionButton(
                    onClick = {
                        haptic(HapticFeedbackType.LongPress)
                        showQuickAddSheet = true
                    },
                ) {
                    Icon(Icons.Default.Add, stringResource(R.string.dashboard_add_entry))
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (showAiMealSheet) {
            AiMealSheet(
                date = selectedDate.toString(),
                onDismiss = { showAiMealSheet = false },
                onQueued = {
                    showAiMealSheet = false
                    scope.launch { snackbarHostState.showSnackbar(aiQueuedMessage) }
                },
            )
        }

        if (showQuickAddSheet) {
            EntryEditSheet(
                entryId = null,
                date = selectedDate.toString(),
                onDismiss = { showQuickAddSheet = false },
                onSaved = {
                    showQuickAddSheet = false
                    viewModel.loadData()
                },
            )
        }

        createFoodBarcode?.let { barcode ->
            FoodEditSheet(
                foodId = null,
                onDismiss = { createFoodBarcode = null },
                onSaved = {
                    createFoodBarcode = null
                    viewModel.loadData()
                },
                initialBarcode = barcode,
            )
        }

        addFoodForMeal?.let { meal ->
            AddFoodSheet(
                mealType = meal,
                date = selectedDate.toString(),
                onDismiss = { addFoodForMeal = null },
                onLogged = {
                    addFoodForMeal = null
                    viewModel.loadData()
                },
            )
        }

        PullToRefreshWrapper(
            onRefresh = { viewModel.refreshAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            // Swipe right → previous day, swipe left → next day,
                            // mirroring the iOS dashboard date gesture.
                            var dragAmount = 0f
                            detectHorizontalDragGestures(
                                onDragStart = { dragAmount = 0f },
                                onDragEnd = {
                                    val threshold = 64.dp.toPx()
                                    when {
                                        dragAmount > threshold -> {
                                            haptic(HapticFeedbackType.LongPress)
                                            viewModel.previousDay()
                                        }

                                        dragAmount < -threshold -> {
                                            haptic(HapticFeedbackType.LongPress)
                                            viewModel.nextDay()
                                        }
                                    }
                                },
                                onHorizontalDrag = { _, delta -> dragAmount += delta },
                            )
                        }.verticalScroll(rememberScrollState())
                        // Bottom clearance for the three stacked FABs, which
                        // otherwise sit on top of the last widget on the day.
                        .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 176.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    MacroRing(
                        stringResource(R.string.macro_calories),
                        totalCalories,
                        goals?.calorieGoal ?: DefaultGoals.CALORIES,
                        CaloriesBlue,
                        size = 88.dp,
                        strokeWidth = 8.dp,
                        showGoal = true,
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    MacroRing(
                        stringResource(R.string.macro_protein),
                        totalProtein,
                        goals?.proteinGoal ?: DefaultGoals.PROTEIN,
                        ProteinRed,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_carbs),
                        totalCarbs,
                        goals?.carbGoal ?: DefaultGoals.CARBS,
                        CarbsOrange,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_fat),
                        totalFat,
                        goals?.fatGoal ?: DefaultGoals.FAT,
                        FatYellow,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_fiber),
                        totalFiber,
                        goals?.fiberGoal ?: DefaultGoals.FIBER,
                        FiberGreen,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                }

                if (selectedDate == today) {
                    Spacer(modifier = Modifier.height(16.dp))
                    FastingCard(onClick = { navController.navigate("fasting") })
                }

                Spacer(modifier = Modifier.height(28.dp))

                Crossfade(targetState = isLoading, label = "dashboard") { loading ->
                    if (loading) {
                        DashboardSkeleton()
                    } else {
                        Column {
                            val mealGroups = remember(entries) { entries.groupBy { normalizeMealType(it.mealType) } }

                            mealTypes.forEach { meal ->
                                val mealEntries = mealGroups[meal] ?: emptyList()
                                MealCard(
                                    meal,
                                    mealEntries,
                                    onClick = { navController.navigate("daylog/$selectedDate") },
                                    onAddClick = { addFoodForMeal = meal },
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                            mealGroups.keys.filter { it !in mealTypes }.forEach { meal ->
                                val mealEntries = mealGroups[meal] ?: emptyList()
                                MealCard(
                                    meal,
                                    mealEntries,
                                    onClick = { navController.navigate("daylog/$selectedDate") },
                                    onAddClick = { addFoodForMeal = meal },
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            if (entries.isEmpty()) {
                                if (refreshFailed) {
                                    RefreshErrorState(onRetry = { viewModel.loadData() })
                                } else {
                                    OutlinedButton(
                                        onClick = { copyEntries() },
                                        modifier = Modifier.align(Alignment.CenterHorizontally),
                                    ) {
                                        Icon(
                                            Icons.Default.ContentCopy,
                                            stringResource(R.string.dashboard_copy),
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(stringResource(R.string.dashboard_copy_from_yesterday))
                                    }
                                }
                            }

                            // The optional cards follow the order of the widget list in
                            // Settings: chart, favorites, supplements, weight, sleep,
                            // meal breakdown, top foods.
                            if (prefs?.showChartWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                CalorieTrendWidget(date = selectedDate.toString())
                            }

                            // Logging into a past day from a quick-log row would be a
                            // surprise, so favourites only appear on today — same rule
                            // as the web dashboard.
                            if (prefs?.showFavoritesWidget == true && selectedDate == today) {
                                Spacer(modifier = Modifier.height(16.dp))
                                FavoritesQuickLogWidget(
                                    date = selectedDate.toString(),
                                    onViewAll = { navController.navigate("favorites") },
                                    onLogged = { name ->
                                        scope.launch {
                                            snackbarHostState.showSnackbar(loggedFormat.format(name))
                                        }
                                        viewModel.loadData()
                                    },
                                )
                            }

                            // Supplements widget
                            if (prefs?.showSupplementsWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                SupplementsWidget(
                                    date = selectedDate.toString(),
                                    onViewAll = { navController.navigate("supplements") },
                                )
                            }

                            // Weight widget
                            if (prefs?.showWeightWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                WeightWidget(
                                    date = selectedDate.toString(),
                                    onViewAll = { navController.navigate("weight") },
                                    onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                )
                            }

                            // Sleep widget
                            if (prefs?.showSleepWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                SleepWidget(onViewAll = { navController.navigate("sleep") })
                            }

                            if (prefs?.showMealBreakdownWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                MealBreakdownWidget(
                                    date = selectedDate.toString(),
                                    entries = entries,
                                    isLocalMode = isLocalMode,
                                )
                            }

                            if (prefs?.showTopFoodsWidget == true) {
                                Spacer(modifier = Modifier.height(16.dp))
                                TopFoodsWidget(isLocalMode = isLocalMode)
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Shown when the entries refresh failed and the day has nothing cached, so a
 * swallowed network error isn't mistaken for a day with no food logged.
 */
@Composable
private fun RefreshErrorState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Default.CloudOff,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(R.string.dashboard_refresh_failed_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            stringResource(R.string.dashboard_refresh_failed_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = onRetry) {
            Text(stringResource(R.string.dashboard_retry))
        }
    }
}
