package com.bissbilanz.android.navigation

import androidx.annotation.StringRes
import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.bissbilanz.android.R
import com.bissbilanz.android.tips.AnchoredTip
import com.bissbilanz.android.tips.HelpSlugs
import com.bissbilanz.android.tips.TipIds
import com.bissbilanz.android.tips.TipStore
import com.bissbilanz.android.ui.components.SyncConflictBanner
import com.bissbilanz.android.ui.theme.Motion
import com.bissbilanz.android.ui.theme.cardSurface
import com.bissbilanz.android.ui.theme.hairline
import com.bissbilanz.android.ui.util.rememberPreference
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.isUnreadDismissal
import com.bissbilanz.util.unreadReplies
import org.koin.compose.koinInject

sealed class Screen(
    val route: String,
    @param:StringRes val titleRes: Int,
    val icon: ImageVector,
) {
    data object Dashboard : Screen(NavTabs.HOME, R.string.nav_home, Icons.Default.Home)

    data object Foods : Screen("foods", R.string.food_search_title, Icons.Default.Restaurant)

    data object Favorites : Screen("favorites", R.string.favorites_title, Icons.Default.Star)

    data object Insights : Screen("insights", R.string.settings_nav_insights, Icons.Default.BarChart)

    data object Weight : Screen("weight", R.string.weight_widget_title, Icons.Default.MonitorWeight)

    data object Supplements : Screen("supplements", R.string.chart_supplements, Icons.Default.Medication)

    data object RecipeSuggestions :
        Screen("recipe-suggestions", R.string.recipe_suggestions_title, Icons.Default.Lightbulb)

    data object Recipes : Screen("recipes", R.string.recipe_list_title, Icons.AutoMirrored.Filled.MenuBook)

    data object AiTasks : Screen("ai-tasks", R.string.ai_tasks_title, Icons.Default.AutoAwesome)

    data object Chat : Screen("chat", R.string.chat_title, Icons.AutoMirrored.Filled.Chat)

    data object Sleep : Screen("sleep", R.string.sleep_section_title, Icons.Default.Bedtime)

    data object Calendar : Screen("calendar", R.string.settings_nav_calendar, Icons.Default.CalendarMonth)

    data object Fasting : Screen("fasting", R.string.fasting_title, Icons.Default.Timer)

    data object Settings : Screen(NavTabs.SETTINGS, R.string.settings_title, Icons.Default.Settings)
}

private val tabScreens =
    listOf(
        Screen.Foods,
        Screen.Favorites,
        Screen.Insights,
        Screen.Weight,
        Screen.Supplements,
        Screen.RecipeSuggestions,
        Screen.Recipes,
        Screen.AiTasks,
        Screen.Chat,
        Screen.Sleep,
        Screen.Calendar,
        Screen.Fasting,
    ).associateBy { it.route }

/** The bar entry for one of [NavTabs.CANDIDATES]. */
fun tabScreen(id: String): Screen = tabScreens.getValue(id)

const val NAV_KEY_CREATE_FOOD_BARCODE = "create_food_barcode"
const val NAV_KEY_EDIT_SUPPLEMENT_ID = "edit_supplement_id"

/** Screens that are only ever pushed, so the bar steps aside for them. */
private val pushedRoutes =
    setOf(
        "scanner",
        "supplement-history",
        "maintenance",
        "pending-sync",
        "health",
        "connect-claude",
        "reminders",
        "food-duplicates",
        "food-package-import",
        "enhance-foods",
        "dashboard-layout",
    )

/** Switches to a bar tab, keeping every tab's own back stack. */
fun NavController.selectTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) {
            saveState = true
        }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Opens [route] from anywhere but the bar itself — a Settings row, a link on another
 * screen, a notification, a shortcut or a widget. A destination on the bar is switched to
 * and shown at its root (a deeper screen left open in that tab is dropped), never pushed
 * a second time; anything else is pushed.
 */
fun NavController.openDestination(
    route: String,
    barRoutes: List<String>,
) {
    if (route in barRoutes) {
        selectTab(route)
        popBackStack(route, inclusive = false)
    } else {
        navigate(route) { launchSingleTop = true }
    }
}

/** Everything on the bar right now, for screens that link to a destination that may be a tab. */
val LocalBarRoutes = compositionLocalOf { NavTabs.barRoutes(emptyList()) }

/** What opening the AI task list clears: dismissals and assistant replies not seen yet. */
fun aiTaskAttentionCount(tasks: List<AiTask>): Int = tasks.count { it.isUnreadDismissal() } + tasks.sumOf { it.unreadReplies().size }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val tabPrefs = remember(context) { NavTabPrefs(context) }
    val tabConfig by rememberPreference(tabPrefs.prefs) { tabPrefs.read() }
    val appModeManager: AppModeManager = koinInject()
    val mode by appModeManager.mode.collectAsStateWithLifecycle()
    // Filtered here rather than in storage, so an account-only tab comes back after sign-in.
    val visibleTabs by remember { derivedStateOf { NavTabs.visible(tabConfig.tabs, mode != AppMode.LOCAL) } }
    val barRoutes by remember { derivedStateOf { NavTabs.barRoutes(visibleTabs) } }

    val landing = rememberLandingTab { NavTabs.landingTab(tabConfig.landing, visibleTabs) }
    PendingNavigationHandler(navController, barRoutes = { barRoutes }, landing = landing)

    val bottomNavItems = listOf(Screen.Dashboard) + visibleTabs.map(::tabScreen) + Screen.Settings

    CompositionLocalProvider(LocalBarRoutes provides barRoutes) {
        AppScaffold(navController, landing, bottomNavItems, visibleTabs = { visibleTabs })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppScaffold(
    navController: NavHostController,
    landing: LandingTab,
    bottomNavItems: List<Screen>,
    visibleTabs: () -> List<String>,
) {
    Scaffold(
        // Kept invisible until the landing tab is on screen, so a cold start does not show
        // Home for a frame before switching. Home still composes underneath: its view model
        // loads today's data on launch whichever tab the app opens on.
        modifier = Modifier.alpha(if (landing.pending) 0f else 1f),
        // The shell only reserves room for the bottom bar. Top insets are left to
        // each screen's own Scaffold so its TopAppBar draws under the status bar
        // the way Material intends, instead of sitting below a bare coloured gap.
        contentWindowInsets = WindowInsets(0),
        topBar = {
            // Above the nav host so a lost offline edit is visible wherever the
            // user happens to be, not only on the screen that made the edit.
            SyncConflictBanner()
        },
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
            val currentRoute = currentDestination?.route

            // A tab destination keeps the bar only as its tab's root; off the bar it is an
            // ordinary pushed screen with a back arrow. Same rule as its own back arrow.
            val hideBottomBar =
                currentRoute in pushedRoutes ||
                    (currentRoute in NavTabs.CANDIDATES && !NavTabs.isTabRoot(currentRoute, visibleTabs())) ||
                    currentRoute?.startsWith("food/") == true ||
                    currentRoute?.startsWith("daylog/") == true ||
                    currentRoute?.startsWith("recipe/") == true

            // Animated with the nav host's own spring, so the host's height does not
            // jump by the bar's height at the start of a transition.
            AnimatedVisibility(
                visible = !hideBottomBar,
                enter =
                    slideInVertically(
                        spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                    ) { it } +
                        expandVertically(
                            spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                        ),
                exit =
                    slideOutVertically(
                        spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                    ) { it } +
                        shrinkVertically(
                            spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                        ),
            ) {
                val tipStore: TipStore = koinInject()
                val foodLoggedCount by tipStore.foodLoggedCount.collectAsStateWithLifecycle()
                val aiTaskRepo: AiTaskRepository = koinInject()
                val aiTasks by aiTaskRepo.tasks.collectAsStateWithLifecycle()
                val aiTaskAttention = remember(aiTasks) { aiTaskAttentionCount(aiTasks) }
                Column {
                    HorizontalDivider(color = MaterialTheme.hairline)
                    NavigationBar(containerColor = MaterialTheme.cardSurface, tonalElevation = 0.dp) {
                        bottomNavItems.forEach { screen ->
                            NavigationBarItem(
                                icon = {
                                    if (screen == Screen.Favorites) {
                                        // One-tap logging is only worth advertising once someone
                                        // has logged enough to feel the friction of typing every time.
                                        AnchoredTip(
                                            tipId = TipIds.FAVORITES,
                                            title = stringResource(R.string.tip_favorites_title),
                                            text = stringResource(R.string.tip_favorites_text),
                                            helpSlug = HelpSlugs.LOGGING,
                                            eligible = foodLoggedCount >= 5,
                                        ) {
                                            Icon(screen.icon, contentDescription = null)
                                        }
                                    } else if (screen == Screen.AiTasks && aiTaskAttention > 0) {
                                        val badgeDescription =
                                            pluralStringResource(R.plurals.nav_ai_tasks_badge, aiTaskAttention, aiTaskAttention)
                                        BadgedBox(
                                            badge = {
                                                Badge(modifier = Modifier.semantics { contentDescription = badgeDescription }) {
                                                    Text(aiTaskAttention.toString())
                                                }
                                            },
                                        ) {
                                            Icon(screen.icon, contentDescription = null)
                                        }
                                    } else {
                                        Icon(screen.icon, contentDescription = null)
                                    }
                                },
                                label = {
                                    // Five equal slots leave ~80dp each, which "Einstellungen" and
                                    // "Auswertungen" overflow in German; shrink instead of wrapping.
                                    Text(
                                        stringResource(screen.titleRes),
                                        maxLines = 1,
                                        autoSize = TextAutoSize.StepBased(minFontSize = 8.sp, maxFontSize = 12.sp),
                                    )
                                },
                                selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                                onClick = { navController.selectTab(screen.route) },
                                colors =
                                    NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                    ),
                            )
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .padding(innerPadding)
                    .consumeWindowInsets(innerPadding),
        ) {
            NavHost(
                navController = navController,
                startDestination = Screen.Dashboard.route,
                modifier = Modifier.weight(1f).imePadding(),
                // Opening on the landing tab is where the app starts, not a step from Home.
                enterTransition = {
                    if (targetState.id == landing.entryId) {
                        EnterTransition.None
                    } else {
                        fadeIn(spring(stiffness = Spring.StiffnessMedium)) +
                            slideInHorizontally(
                                spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                            ) { it / 5 }
                    }
                },
                exitTransition = {
                    if (targetState.id == landing.entryId) {
                        ExitTransition.None
                    } else {
                        fadeOut(spring(stiffness = Spring.StiffnessHigh))
                    }
                },
                popEnterTransition = {
                    fadeIn(spring(stiffness = Spring.StiffnessMedium)) +
                        slideInHorizontally(
                            spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                        ) { -it / 5 }
                },
                popExitTransition = {
                    fadeOut(spring(stiffness = Spring.StiffnessHigh)) +
                        slideOutHorizontally(
                            spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                        ) { it / 5 }
                },
            ) {
                bissbilanzDestinations(navController, visibleTabs)
            }
        }
    }
}

/**
 * Every destination the app can reach. Kept apart from [AppNavigation] so the graph can
 * be built without the Compose shell — the launcher shortcuts name routes as plain
 * strings, and a test has to be able to check they still resolve to something.
 */
internal fun NavGraphBuilder.bissbilanzDestinations(
    navController: NavHostController,
    tabRoutes: () -> List<String>,
) {
    // A destination that can be on the bar: no back arrow while it is its tab's root,
    // a pushed screen with one everywhere else. Same rule as the bar's own visibility.
    fun tabCandidate(
        screen: Screen,
        content: @Composable (showBack: Boolean) -> Unit,
    ) {
        composable(screen.route) {
            content(!NavTabs.isTabRoot(screen.route, tabRoutes()))
        }
    }

    composable(Screen.Dashboard.route) {
        com.bissbilanz.android.ui.screens
            .DashboardScreen(navController)
    }
    tabCandidate(Screen.Foods) { showBack ->
        com.bissbilanz.android.ui.screens
            .FoodSearchScreen(navController, showBack)
    }
    tabCandidate(Screen.Favorites) { showBack ->
        com.bissbilanz.android.ui.screens
            .FavoritesScreen(navController, showBack)
    }
    tabCandidate(Screen.Insights) { showBack ->
        com.bissbilanz.android.ui.screens
            .InsightsScreen(navController, showBack)
    }
    composable(Screen.Settings.route) {
        com.bissbilanz.android.ui.screens
            .SettingsScreen(navController)
    }
    composable("food/{foodId}") { backStackEntry ->
        val foodId = backStackEntry.arguments?.getString("foodId") ?: return@composable
        com.bissbilanz.android.ui.screens
            .FoodDetailScreen(foodId, navController)
    }
    // `entry` is set by the "where it's logged" lists: that entry is scrolled to and highlighted.
    composable(
        "daylog/{date}?entry={entry}",
        arguments =
            listOf(
                navArgument("entry") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
    ) { backStackEntry ->
        val date = backStackEntry.arguments?.getString("date") ?: return@composable
        com.bissbilanz.android.ui.screens
            .DayLogScreen(date, navController, highlightEntryId = backStackEntry.arguments?.getString("entry"))
    }
    composable("scanner") {
        com.bissbilanz.android.ui.screens
            .BarcodeScannerScreen(navController)
    }
    tabCandidate(Screen.Recipes) { showBack ->
        com.bissbilanz.android.ui.screens
            .RecipeListScreen(navController, showBack)
    }
    composable("recipe/{recipeId}") { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId") ?: return@composable
        com.bissbilanz.android.ui.screens
            .RecipeDetailScreen(recipeId, navController, backStackEntry.savedStateHandle)
    }
    composable("recipe/{recipeId}/cook") { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId") ?: return@composable
        com.bissbilanz.android.ui.screens
            .RecipeCookScreen(recipeId, navController)
    }
    tabCandidate(Screen.Weight) { showBack ->
        com.bissbilanz.android.ui.screens
            .WeightScreen(navController, showBack)
    }
    tabCandidate(Screen.Sleep) { showBack ->
        com.bissbilanz.android.ui.screens
            .SleepScreen(navController, showBack)
    }
    tabCandidate(Screen.Supplements) { showBack ->
        com.bissbilanz.android.ui.screens
            .SupplementsScreen(navController, showBack)
    }
    tabCandidate(Screen.RecipeSuggestions) { showBack ->
        com.bissbilanz.android.ui.screens
            .RecipeSuggestionsScreen(navController, showBack)
    }
    composable("supplement-history") {
        com.bissbilanz.android.ui.screens
            .SupplementHistoryScreen(navController)
    }
    tabCandidate(Screen.Calendar) { showBack ->
        com.bissbilanz.android.ui.screens
            .CalendarScreen(navController, showBack)
    }
    composable("health") {
        com.bissbilanz.android.ui.screens
            .HealthConnectScreen(navController)
    }
    tabCandidate(Screen.Fasting) { showBack ->
        com.bissbilanz.android.ui.screens
            .FastingScreen(navController, showBack)
    }
    composable("dashboard-layout") {
        com.bissbilanz.android.ui.screens
            .DashboardLayoutScreen(navController)
    }
    composable("pending-sync") {
        com.bissbilanz.android.ui.screens
            .PendingSyncScreen(navController)
    }
    composable("maintenance") {
        com.bissbilanz.android.ui.screens
            .MaintenanceScreen(navController)
    }
    tabCandidate(Screen.AiTasks) { showBack ->
        com.bissbilanz.android.ui.screens
            .AiTasksScreen(navController, showBack)
    }
    tabCandidate(Screen.Chat) { showBack ->
        com.bissbilanz.android.ui.screens
            .ChatScreen(navController, showBack)
    }
    composable("connect-claude") {
        com.bissbilanz.android.ui.screens
            .ConnectAssistantScreen(navController)
    }
    composable("reminders") {
        com.bissbilanz.android.ui.screens
            .RemindersScreen(navController)
    }
    composable("food-duplicates") {
        com.bissbilanz.android.ui.screens
            .FoodDuplicatesScreen(navController)
    }
    composable("food-package-import") {
        com.bissbilanz.android.ui.screens
            .FoodPackageImportScreen(navController)
    }
    composable("enhance-foods") {
        com.bissbilanz.android.ui.screens
            .EnhanceFoodsScreen(navController)
    }
}
