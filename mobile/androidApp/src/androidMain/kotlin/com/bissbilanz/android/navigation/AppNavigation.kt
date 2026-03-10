package com.bissbilanz.android.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    data object Dashboard : Screen("dashboard", "Home", Icons.Default.Home)
    data object Foods : Screen("foods", "Foods", Icons.Default.Restaurant)
    data object Favorites : Screen("favorites", "Favorites", Icons.Default.Star)
    data object Insights : Screen("insights", "Insights", Icons.Default.BarChart)
    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}

val bottomNavItems = listOf(
    Screen.Dashboard,
    Screen.Foods,
    Screen.Favorites,
    Screen.Insights,
    Screen.Settings
)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination

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
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Dashboard.route) {
                com.bissbilanz.android.ui.screens.DashboardScreen(navController)
            }
            composable(Screen.Foods.route) {
                com.bissbilanz.android.ui.screens.FoodSearchScreen(navController)
            }
            composable(Screen.Favorites.route) {
                com.bissbilanz.android.ui.screens.FavoritesScreen(navController)
            }
            composable(Screen.Insights.route) {
                com.bissbilanz.android.ui.screens.InsightsScreen()
            }
            composable(Screen.Settings.route) {
                com.bissbilanz.android.ui.screens.SettingsScreen()
            }
            composable("food/{foodId}") { backStackEntry ->
                val foodId = backStackEntry.arguments?.getString("foodId") ?: return@composable
                com.bissbilanz.android.ui.screens.FoodDetailScreen(foodId, navController)
            }
            composable("daylog/{date}") { backStackEntry ->
                val date = backStackEntry.arguments?.getString("date") ?: return@composable
                com.bissbilanz.android.ui.screens.DayLogScreen(date, navController)
            }
            composable("scanner") {
                com.bissbilanz.android.ui.screens.BarcodeScannerScreen(navController)
            }
        }
    }
}
