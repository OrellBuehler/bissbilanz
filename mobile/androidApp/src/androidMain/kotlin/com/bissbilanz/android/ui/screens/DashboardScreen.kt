package com.bissbilanz.android.ui.screens

import android.appwidget.AppWidgetManager
import android.content.ComponentName
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
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.NAV_KEY_CREATE_FOOD_BARCODE
import com.bissbilanz.android.tips.AnchoredTip
import com.bissbilanz.android.tips.HelpSlugs
import com.bissbilanz.android.tips.HintCard
import com.bissbilanz.android.tips.TipIds
import com.bissbilanz.android.tips.TipStore
import com.bissbilanz.android.tips.openHelp
import com.bissbilanz.android.tips.rememberActiveTipId
import com.bissbilanz.android.ui.components.AddFoodSheet
import com.bissbilanz.android.ui.components.AiMealSheet
import com.bissbilanz.android.ui.components.CalorieTrendWidget
import com.bissbilanz.android.ui.components.DashboardSkeleton
import com.bissbilanz.android.ui.components.DayPropertiesCard
import com.bissbilanz.android.ui.components.EntryEditSheet
import com.bissbilanz.android.ui.components.FastingCard
import com.bissbilanz.android.ui.components.FavoritesQuickLogWidget
import com.bissbilanz.android.ui.components.FoodEditSheet
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealBreakdownWidget
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RecipeSuggestionsWidget
import com.bissbilanz.android.ui.components.SleepWidget
import com.bissbilanz.android.ui.components.SupplementsWidget
import com.bissbilanz.android.ui.components.TopFoodsWidget
import com.bissbilanz.android.ui.components.WeightWidget
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.android.util.DashboardSection
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.android.util.resolveDashboardSections
import com.bissbilanz.android.widget.DayOverviewWidgetReceiver
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.util.DefaultGoals
import com.bissbilanz.util.mealForCurrentTime
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
    val isFastingDay by viewModel.isFastingDay.collectAsStateWithLifecycle()
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val waterMl by viewModel.waterMl.collectAsStateWithLifecycle()
    val waterGoalMl by viewModel.waterGoalMl.collectAsStateWithLifecycle()
    val activityCalories by viewModel.activityCalories.collectAsStateWithLifecycle()
    val activityCaloriesSource by viewModel.activityCaloriesSource.collectAsStateWithLifecycle()
    val activityNote by viewModel.activityNote.collectAsStateWithLifecycle()
    val adjustedGoals by viewModel.adjustedGoals.collectAsStateWithLifecycle()

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
    var fabMenuExpanded by remember { mutableStateOf(false) }
    var createFoodBarcode by remember { mutableStateOf<String?>(null) }
    var addFoodForMeal by remember { mutableStateOf<String?>(null) }

    val tipStore: TipStore = koinInject()
    val tipFoodLoggedCount by tipStore.foodLoggedCount.collectAsStateWithLifecycle()
    // Priority order: the layout editor nudge comes first on every fresh install, the
    // scan tip only while its menu happens to be open, and the widgets nudge once the
    // user has proven they log often enough to want a shortcut past the app.
    val activeTipId =
        rememberActiveTipId(
            listOf(
                TipIds.DASHBOARD_LAYOUT to true,
                TipIds.SCANNING to fabMenuExpanded,
                TipIds.WIDGETS to (tipFoodLoggedCount >= 10),
            ),
        )

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

    // Rings, remaining calories and macro targets all read the activity-adjusted
    // goals so a workout-credit day shows the raised targets everywhere at once.
    val effectiveGoals = adjustedGoals?.goals ?: goals
    val activityBonus = adjustedGoals?.activityBonus ?: 0

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
                        enabled = selectedDate < today,
                        onClick = {
                            haptic(HapticFeedbackType.LongPress)
                            viewModel.nextDay()
                        },
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            stringResource(R.string.dashboard_next_day),
                        )
                    }
                    AnchoredTip(
                        tipId = TipIds.DASHBOARD_LAYOUT,
                        title = stringResource(R.string.tip_dashboard_layout_title),
                        text = stringResource(R.string.tip_dashboard_layout_text),
                        helpSlug = HelpSlugs.GETTING_STARTED,
                        eligible = activeTipId == TipIds.DASHBOARD_LAYOUT,
                    ) {
                        IconButton(onClick = { navController.navigate("dashboard-layout") }) {
                            Icon(Icons.Outlined.Tune, stringResource(R.string.dashboard_layout_title))
                        }
                    }
                },
                scrollBehavior = scrollBehavior,
            )
        },
        floatingActionButton = {
            // One FAB that opens a menu with the four ways to log. The menu
            // opens upward from the bottom corner, so the most common action
            // (search) is declared last to sit closest to the thumb — the
            // same nearest-first order as iOS.
            Box {
                FloatingActionButton(
                    onClick = {
                        haptic(HapticFeedbackType.LongPress)
                        fabMenuExpanded = true
                    },
                ) {
                    Icon(Icons.Default.Add, stringResource(R.string.dashboard_add_entry))
                }
                DropdownMenu(
                    expanded = fabMenuExpanded,
                    onDismissRequest = { fabMenuExpanded = false },
                ) {
                    // Queuing a meal for the assistant needs the server, so it is
                    // hidden in local mode — same rule as iOS.
                    if (!isLocalMode) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.ai_task_title)) },
                            leadingIcon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
                            onClick = {
                                fabMenuExpanded = false
                                showAiMealSheet = true
                            },
                        )
                    }
                    AnchoredTip(
                        tipId = TipIds.SCANNING,
                        title = stringResource(R.string.tip_scanning_title),
                        text = stringResource(R.string.tip_scanning_text),
                        helpSlug = HelpSlugs.SCANNING,
                        eligible = activeTipId == TipIds.SCANNING,
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.scan_widget_content_desc)) },
                            leadingIcon = { Icon(Icons.Default.QrCodeScanner, contentDescription = null) },
                            onClick = {
                                fabMenuExpanded = false
                                navController.navigate("scanner")
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.daylog_quick_add)) },
                        leadingIcon = { Icon(Icons.Default.Bolt, contentDescription = null) },
                        onClick = {
                            fabMenuExpanded = false
                            showQuickAddSheet = true
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.dashboard_menu_search_food)) },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        onClick = {
                            fabMenuExpanded = false
                            addFoodForMeal = mealForCurrentTime()
                        },
                    )
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
                            // for quick navigation between logged days.
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
                        effectiveGoals?.calorieGoal ?: DefaultGoals.CALORIES,
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
                        effectiveGoals?.proteinGoal ?: DefaultGoals.PROTEIN,
                        ProteinRed,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_carbs),
                        totalCarbs,
                        effectiveGoals?.carbGoal ?: DefaultGoals.CARBS,
                        CarbsOrange,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_fat),
                        totalFat,
                        effectiveGoals?.fatGoal ?: DefaultGoals.FAT,
                        FatYellow,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        stringResource(R.string.macro_fiber),
                        totalFiber,
                        effectiveGoals?.fiberGoal ?: DefaultGoals.FIBER,
                        FiberGreen,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                }

                val activityCaloriesValue = activityCalories
                if (activityCaloriesValue != null && activityCaloriesValue > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.day_activity_summary, activityCaloriesValue),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (activityBonus > 0) {
                        Text(
                            stringResource(R.string.day_activity_goal_bonus, activityBonus),
                            style = MaterialTheme.typography.bodySmall,
                            color = CaloriesBlue.macroTextTone(),
                        )
                    }
                }

                if (activeTipId == TipIds.WIDGETS) {
                    Spacer(modifier = Modifier.height(16.dp))
                    val widgetTipContext = LocalContext.current
                    val widgetManager = remember { AppWidgetManager.getInstance(widgetTipContext) }
                    HintCard(
                        title = stringResource(R.string.tip_widgets_title),
                        text = stringResource(R.string.tip_widgets_text),
                        onLearnMore = {
                            openHelp(widgetTipContext, HelpSlugs.MOBILE_EXTRAS)
                            tipStore.dismiss(TipIds.WIDGETS)
                        },
                        onDismiss = { tipStore.dismiss(TipIds.WIDGETS) },
                        action = {
                            if (widgetManager.isRequestPinAppWidgetSupported) {
                                TextButton(onClick = {
                                    widgetManager.requestPinAppWidget(
                                        ComponentName(widgetTipContext, DayOverviewWidgetReceiver::class.java),
                                        null,
                                        null,
                                    )
                                    tipStore.dismiss(TipIds.WIDGETS)
                                }) { Text(stringResource(R.string.tip_widgets_add_widget)) }
                            }
                        },
                    )
                }

                // Order and visibility come from prefs.widgetOrder; see DashboardSection
                // for the key-to-card mapping and the "prefs not loaded yet" fallback.
                val sections =
                    remember(prefs) { resolveDashboardSections(prefs?.widgetOrder, prefs) }

                Crossfade(targetState = isLoading, label = "dashboard") { loading ->
                    if (loading) {
                        DashboardSkeleton()
                    } else {
                        Column {
                            val mealGroups = remember(entries) { entries.groupBy { normalizeMealType(it.mealType) } }

                            sections.forEach { section ->
                                key(section) {
                                    when (section) {
                                        DashboardSection.FASTING -> {
                                            if (selectedDate == today) {
                                                Spacer(modifier = Modifier.height(16.dp))
                                                FastingCard(onClick = { navController.navigate("fasting") })
                                            }

                                            if (totalCalories == 0.0 && !refreshFailed) {
                                                Spacer(modifier = Modifier.height(16.dp))
                                                Card(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    colors =
                                                        CardDefaults.cardColors(
                                                            containerColor =
                                                                MaterialTheme.colorScheme.surfaceVariant
                                                                    .copy(alpha = 0.5f),
                                                        ),
                                                ) {
                                                    Row(
                                                        modifier =
                                                            Modifier
                                                                .fillMaxWidth()
                                                                .padding(horizontal = 16.dp, vertical = 12.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(
                                                                stringResource(R.string.fasting_day),
                                                                style = MaterialTheme.typography.bodyMedium,
                                                                fontWeight = FontWeight.Medium,
                                                            )
                                                            Text(
                                                                stringResource(R.string.fasting_day_description),
                                                                style = MaterialTheme.typography.bodySmall,
                                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                            )
                                                        }
                                                        Switch(
                                                            checked = isFastingDay,
                                                            onCheckedChange = {
                                                                haptic(HapticFeedbackType.LongPress)
                                                                viewModel.toggleFastingDay()
                                                            },
                                                        )
                                                    }
                                                }
                                            }
                                        }

                                        DashboardSection.DAY_PROPERTIES -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            DayPropertiesCard(
                                                notes = notes,
                                                waterMl = waterMl,
                                                waterGoalMl = waterGoalMl,
                                                activityCalories = activityCalories,
                                                activityCaloriesSource = activityCaloriesSource,
                                                activityNote = activityNote,
                                                onAddWater = { viewModel.addWater(it) },
                                                onSetWater = { viewModel.setWater(it) },
                                                onClearWater = { viewModel.clearWater() },
                                                onSetActivity = { cal, note -> viewModel.setActivity(cal, note) },
                                                onClearActivity = { viewModel.clearActivity() },
                                                onNotesChanged = { viewModel.setNotes(it) },
                                            )
                                        }

                                        DashboardSection.DAYLOG -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Column {
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
                                            }
                                        }

                                        DashboardSection.CHART -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            CalorieTrendWidget(date = selectedDate.toString(), entries = entries)
                                        }

                                        DashboardSection.FAVORITES -> {
                                            // Logging into a past day from a quick-log row would be a
                                            // surprise, so favourites only appear on today — same rule
                                            // as the web dashboard.
                                            if (selectedDate == today) {
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
                                        }

                                        DashboardSection.RECIPE_SUGGESTIONS -> {
                                            // Suggestions rank recipes against what's left of *today's*
                                            // goal, so — same as favourites — they only make sense on today.
                                            if (selectedDate == today) {
                                                Spacer(modifier = Modifier.height(16.dp))
                                                RecipeSuggestionsWidget(
                                                    date = selectedDate.toString(),
                                                    activityCalories = activityCalories,
                                                    onViewAll = { navController.navigate("recipe-suggestions") },
                                                    onLogged = { name ->
                                                        scope.launch {
                                                            snackbarHostState.showSnackbar(loggedFormat.format(name))
                                                        }
                                                        viewModel.loadData()
                                                    },
                                                )
                                            }
                                        }

                                        DashboardSection.SUPPLEMENTS -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            SupplementsWidget(
                                                date = selectedDate.toString(),
                                                onViewAll = { navController.navigate("supplements") },
                                            )
                                        }

                                        DashboardSection.WEIGHT -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            WeightWidget(
                                                date = selectedDate.toString(),
                                                onViewAll = { navController.navigate("weight") },
                                                onError = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
                                            )
                                        }

                                        DashboardSection.SLEEP -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            SleepWidget(onViewAll = { navController.navigate("sleep") })
                                        }

                                        DashboardSection.MEAL_BREAKDOWN -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            MealBreakdownWidget(entries = entries)
                                        }

                                        DashboardSection.TOP_FOODS -> {
                                            Spacer(modifier = Modifier.height(16.dp))
                                            TopFoodsWidget(entries = entries, isLocalMode = isLocalMode)
                                        }
                                    }
                                }
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
