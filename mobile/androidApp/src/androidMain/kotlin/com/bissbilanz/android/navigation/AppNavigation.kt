package com.bissbilanz.android.navigation

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.SyncConflictBanner
import com.bissbilanz.android.ui.theme.Motion

sealed class Screen(
    val route: String,
    @param:StringRes val titleRes: Int,
    val icon: ImageVector,
) {
    data object Dashboard : Screen("dashboard", R.string.nav_home, Icons.Default.Home)

    data object Foods : Screen("foods", R.string.food_search_title, Icons.Default.Restaurant)

    data object Favorites : Screen("favorites", R.string.favorites_title, Icons.Default.Star)

    data object Insights : Screen("insights", R.string.settings_nav_insights, Icons.Default.BarChart)

    data object Weight : Screen("weight", R.string.weight_widget_title, Icons.Default.MonitorWeight)

    data object Supplements : Screen("supplements", R.string.chart_supplements, Icons.Default.Medication)

    data object Settings : Screen("settings", R.string.settings_title, Icons.Default.Settings)
}

val allMiddleTabs = listOf(Screen.Foods, Screen.Favorites, Screen.Insights, Screen.Weight, Screen.Supplements)

const val NAV_KEY_CREATE_FOOD_BARCODE = "create_food_barcode"
val defaultTabRoutes = setOf("foods", "favorites", "insights")

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val tabPrefs = context.getSharedPreferences("nav_tabs", Context.MODE_PRIVATE)

    var selectedTabRoutes by remember {
        mutableStateOf(tabPrefs.getStringSet("selected_tabs", defaultTabRoutes) ?: defaultTabRoutes)
    }

    DisposableEffect(Unit) {
        val listener =
            android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == "selected_tabs") {
                    selectedTabRoutes = tabPrefs.getStringSet("selected_tabs", defaultTabRoutes) ?: defaultTabRoutes
                }
            }
        tabPrefs.registerOnSharedPreferenceChangeListener(listener)
        onDispose { tabPrefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    PendingNavigationHandler(navController)

    val middleTabs = allMiddleTabs.filter { it.route in selectedTabRoutes }
    val bottomNavItems = listOf(Screen.Dashboard) + middleTabs + listOf(Screen.Settings)

    Scaffold(
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

            val hideBottomBar =
                currentRoute in
                    listOf(
                        "scanner",
                        "supplement-history",
                        "recipes",
                        "calendar",
                        "maintenance",
                        "sleep",
                        "pending-sync",
                        "fasting",
                        "health",
                        "ai-tasks",
                    ) ||
                    (currentRoute == "weight" && "weight" !in selectedTabRoutes) ||
                    (currentRoute == "supplements" && "supplements" !in selectedTabRoutes) ||
                    currentRoute?.startsWith("food/") == true ||
                    currentRoute?.startsWith("daylog/") == true ||
                    currentRoute?.startsWith("recipe/") == true

            if (!hideBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = null) },
                            label = { Text(stringResource(screen.titleRes)) },
                            selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
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
                enterTransition = {
                    fadeIn(spring(stiffness = Spring.StiffnessMedium)) +
                        slideInHorizontally(
                            spring(dampingRatio = Motion.DEFAULT_DAMPING, stiffness = Motion.DEFAULT_STIFFNESS),
                        ) { it / 5 }
                },
                exitTransition = {
                    fadeOut(spring(stiffness = Spring.StiffnessHigh))
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
                composable(Screen.Dashboard.route) {
                    com.bissbilanz.android.ui.screens
                        .DashboardScreen(navController)
                }
                composable(Screen.Foods.route) {
                    com.bissbilanz.android.ui.screens
                        .FoodSearchScreen(navController)
                }
                composable(Screen.Favorites.route) {
                    com.bissbilanz.android.ui.screens
                        .FavoritesScreen(navController)
                }
                composable(Screen.Insights.route) {
                    com.bissbilanz.android.ui.screens
                        .InsightsScreen(navController)
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
                composable("daylog/{date}") { backStackEntry ->
                    val date = backStackEntry.arguments?.getString("date") ?: return@composable
                    com.bissbilanz.android.ui.screens
                        .DayLogScreen(date, navController)
                }
                composable("scanner") {
                    com.bissbilanz.android.ui.screens
                        .BarcodeScannerScreen(navController)
                }
                composable("recipes") {
                    com.bissbilanz.android.ui.screens
                        .RecipeListScreen(navController)
                }
                composable("recipe/{recipeId}") { backStackEntry ->
                    val recipeId = backStackEntry.arguments?.getString("recipeId") ?: return@composable
                    com.bissbilanz.android.ui.screens
                        .RecipeDetailScreen(recipeId, navController)
                }
                composable("weight") {
                    com.bissbilanz.android.ui.screens
                        .WeightScreen(navController)
                }
                composable("sleep") {
                    com.bissbilanz.android.ui.screens
                        .SleepScreen(navController)
                }
                composable("supplements") {
                    com.bissbilanz.android.ui.screens
                        .SupplementsScreen(navController)
                }
                composable("supplement-history") {
                    com.bissbilanz.android.ui.screens
                        .SupplementHistoryScreen(navController)
                }
                composable("calendar") {
                    com.bissbilanz.android.ui.screens
                        .CalendarScreen(navController)
                }
                composable("health") {
                    com.bissbilanz.android.ui.screens
                        .HealthConnectScreen(navController)
                }
                composable("fasting") {
                    com.bissbilanz.android.ui.screens
                        .FastingScreen(navController)
                }
                composable("pending-sync") {
                    com.bissbilanz.android.ui.screens
                        .PendingSyncScreen(navController)
                }
                composable("maintenance") {
                    com.bissbilanz.android.ui.screens
                        .MaintenanceScreen(navController)
                }
                composable("ai-tasks") {
                    com.bissbilanz.android.ui.screens
                        .AiTasksScreen(navController)
                }
            }
        }
    }
}
