package com.bissbilanz.android.navigation

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.ui.theme.Motion

sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector,
) {
    data object Dashboard : Screen("dashboard", "Home", Icons.Default.Home)

    data object Foods : Screen("foods", "Foods", Icons.Default.Restaurant)

    data object Favorites : Screen("favorites", "Favorites", Icons.Default.Star)

    data object Insights : Screen("insights", "Insights", Icons.Default.BarChart)

    data object Weight : Screen("weight", "Weight", Icons.Default.MonitorWeight)

    data object Supplements : Screen("supplements", "Supplements", Icons.Default.Medication)

    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
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

    LaunchedEffect(Unit) {
        MainActivity.navigationEvent.collect { route ->
            navController.navigate(route) {
                launchSingleTop = true
            }
        }
    }

    val middleTabs = allMiddleTabs.filter { it.route in selectedTabRoutes }
    val bottomNavItems = listOf(Screen.Dashboard) + middleTabs + listOf(Screen.Settings)

    Scaffold(
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
            val currentRoute = currentDestination?.route

            val hideBottomBar =
                currentRoute in listOf("scanner", "supplement-history", "recipes", "calendar", "maintenance") ||
                    (currentRoute == "weight" && "weight" !in selectedTabRoutes) ||
                    (currentRoute == "supplements" && "supplements" !in selectedTabRoutes) ||
                    currentRoute?.startsWith("food/") == true ||
                    currentRoute?.startsWith("daylog/") == true ||
                    currentRoute?.startsWith("recipe/") == true

            if (!hideBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = screen.title) },
                            label = { Text(screen.title) },
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
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = Modifier.padding(innerPadding).imePadding(),
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
                    .InsightsScreen()
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
            composable("maintenance") {
                com.bissbilanz.android.ui.screens
                    .MaintenanceScreen(navController)
            }
        }
    }
}
