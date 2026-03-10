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

sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector,
) {
    data object Dashboard : Screen("dashboard", "Home", Icons.Default.Home)

    data object Foods : Screen("foods", "Foods", Icons.Default.Restaurant)

    data object Favorites : Screen("favorites", "Favorites", Icons.Default.Star)

    data object Insights : Screen("insights", "Insights", Icons.Default.BarChart)

    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}

val bottomNavItems =
    listOf(
        Screen.Dashboard,
        Screen.Foods,
        Screen.Favorites,
        Screen.Insights,
        Screen.Settings,
    )

@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
            val currentRoute = currentDestination?.route

            val hideBottomBar =
                currentRoute in
                    listOf(
                        "scanner", "weight", "supplements", "recipes",
                        "calendar", "maintenance",
                        "food_create", "recipe_create", "supplement_create",
                    ) ||
                    currentRoute?.startsWith("food/") == true ||
                    currentRoute?.startsWith("daylog/") == true ||
                    currentRoute?.startsWith("recipe/") == true ||
                    currentRoute?.startsWith("entry_edit/") == true ||
                    currentRoute?.startsWith("food_edit/") == true ||
                    currentRoute?.startsWith("recipe_edit/") == true ||
                    currentRoute?.startsWith("supplement_edit/") == true ||
                    currentRoute?.startsWith("quickadd/") == true

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
            modifier = Modifier.padding(innerPadding),
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
            composable("food_create") {
                com.bissbilanz.android.ui.screens
                    .FoodEditScreen(foodId = null, navController = navController)
            }
            composable("food_edit/{foodId}") { backStackEntry ->
                val foodId = backStackEntry.arguments?.getString("foodId") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .FoodEditScreen(foodId = foodId, navController = navController)
            }
            composable("daylog/{date}") { backStackEntry ->
                val date = backStackEntry.arguments?.getString("date") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .DayLogScreen(date, navController)
            }
            composable("entry_edit/{entryId}") { backStackEntry ->
                val entryId = backStackEntry.arguments?.getString("entryId") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .EntryEditScreen(entryId = entryId, date = null, navController = navController)
            }
            composable("quickadd/{date}") { backStackEntry ->
                val date = backStackEntry.arguments?.getString("date") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .EntryEditScreen(entryId = null, date = date, navController = navController)
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
            composable("recipe_create") {
                com.bissbilanz.android.ui.screens
                    .RecipeEditScreen(recipeId = null, navController = navController)
            }
            composable("recipe_edit/{recipeId}") { backStackEntry ->
                val recipeId = backStackEntry.arguments?.getString("recipeId") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .RecipeEditScreen(recipeId = recipeId, navController = navController)
            }
            composable("weight") {
                com.bissbilanz.android.ui.screens
                    .WeightScreen(navController)
            }
            composable("supplements") {
                com.bissbilanz.android.ui.screens
                    .SupplementsScreen(navController)
            }
            composable("supplement_create") {
                com.bissbilanz.android.ui.screens
                    .SupplementEditScreen(supplementId = null, navController = navController)
            }
            composable("supplement_edit/{supplementId}") { backStackEntry ->
                val supplementId = backStackEntry.arguments?.getString("supplementId") ?: return@composable
                com.bissbilanz.android.ui.screens
                    .SupplementEditScreen(supplementId = supplementId, navController = navController)
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
