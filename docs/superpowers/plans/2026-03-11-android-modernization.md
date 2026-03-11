# Android App Modernization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the Android app by updating dependencies, adopting type-safe navigation, consolidating ViewModel state, and adding structured error handling.

**Architecture:** Update from string-based navigation to Kotlin serialization-based type-safe routes. Consolidate fragmented ViewModel StateFlows into single UiState data classes per screen. Introduce an ApiResult sealed class in the shared module for structured error propagation from API through repositories to ViewModels.

**Tech Stack:** Kotlin 2.1.20, Compose BOM 2025.02.00, Navigation 2.8.7, Ktor 3.1.1, Koin 4.1.0, SQLDelight 2.0.3

---

## Chunk 1: Dependency Updates & ApiResult Foundation

### Task 1: Update dependency versions

**Files:**

- Modify: `mobile/gradle/libs.versions.toml`
- Modify: `mobile/build.gradle.kts` (if ktlint version needs update)
- Modify: `mobile/androidApp/build.gradle.kts` (add serialization plugin for nav routes)

- [ ] **Step 1: Update libs.versions.toml**

```toml
[versions]
agp = "8.9.0"
kotlin = "2.1.20"
compose-bom = "2025.02.00"
compose-navigation = "2.8.7"
ktor = "3.1.1"
sqldelight = "2.0.3"
koin = "4.1.0"
coroutines = "1.10.1"
serialization = "1.8.0"
datetime = "0.6.2"
skie = "0.10.1"
mlkit-barcode = "17.3.0"
camerax = "1.4.1"
ktlint = "12.1.2"
mockk = "1.13.16"
turbine = "1.2.0"
health-connect = "1.1.0-alpha10"
security-crypto = "1.1.0-alpha06"
activity-compose = "1.10.0"
lifecycle = "2.9.0"
material3 = "1.3.1"
sentry-android = "7.19.1"
```

- [ ] **Step 2: Add kotlinx-serialization to androidApp build.gradle.kts**

Navigation type-safe routes require the serialization plugin in the androidApp module.

Add to `mobile/androidApp/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.kotlinSerialization)  // NEW
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd mobile && ./gradlew assembleDebug --dry-run`
Expected: BUILD SUCCESSFUL (dependency resolution passes)

- [ ] **Step 4: Full build test**

Run: `cd mobile && ./gradlew androidApp:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add mobile/gradle/libs.versions.toml mobile/androidApp/build.gradle.kts
git commit -m "chore: update android dependencies to latest stable versions"
```

### Task 2: Add ApiResult sealed class

**Files:**

- Create: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/ApiResult.kt`

- [ ] **Step 1: Create ApiResult**

```kotlin
package com.bissbilanz.api

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val message: String, val cause: Throwable? = null) : ApiResult<Nothing>()
}

inline fun <T> apiCall(block: () -> T): ApiResult<T> =
    try {
        ApiResult.Success(block())
    } catch (e: UnauthorizedException) {
        ApiResult.Error("Not authenticated", e)
    } catch (e: Exception) {
        ApiResult.Error(e.message ?: "Unknown error", e)
    }

inline fun <T> ApiResult<T>.onSuccess(action: (T) -> Unit): ApiResult<T> {
    if (this is ApiResult.Success) action(data)
    return this
}

inline fun <T> ApiResult<T>.onError(action: (String, Throwable?) -> Unit): ApiResult<T> {
    if (this is ApiResult.Error) action(message, cause)
    return this
}

fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

fun <T> ApiResult<T>.getOrDefault(default: T): T =
    when (this) {
        is ApiResult.Success -> data
        is ApiResult.Error -> default
    }
```

- [ ] **Step 2: Verify shared module compiles**

Run: `cd mobile && ./gradlew :shared:compileKotlinAndroid`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add mobile/shared/src/commonMain/kotlin/com/bissbilanz/api/ApiResult.kt
git commit -m "feat(android): add ApiResult sealed class for structured error handling"
```

### Task 3: Update repositories to use ApiResult

**Files:**

- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/EntryRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/FoodRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/GoalsRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/RecipeRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/WeightRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/SupplementRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/StatsRepository.kt`
- Modify: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/PreferencesRepository.kt`

**Strategy:** Wrap repository methods that can fail with `apiCall {}`. Keep existing StateFlow exposure. Add new `ApiResult`-returning variants for operations that need error feedback (create, update, delete). Read operations that populate StateFlows keep their current pattern but use `apiCall` internally for cleaner error propagation.

Key pattern for each repository:

```kotlin
// Before:
suspend fun loadEntries(date: String) {
    try {
        val result = api.getEntries(date)
        _entries.value = result
        // cache...
    } catch (e: Exception) {
        // fallback to cache...
    }
}

// After:
suspend fun loadEntries(date: String): ApiResult<List<Entry>> {
    val result = apiCall { api.getEntries(date) }
    result.onSuccess { entries ->
        _entries.value = entries
        // cache...
    }.onError { _, _ ->
        // fallback to cache...
    }
    return result
}

// For mutation operations:
suspend fun deleteEntry(id: String): ApiResult<Unit> = apiCall {
    api.deleteEntry(id)
    loadEntries(currentDate ?: return@apiCall)
}
```

- [ ] **Step 1: Update EntryRepository** — wrap all methods with apiCall, return ApiResult
- [ ] **Step 2: Update FoodRepository** — wrap all methods with apiCall, return ApiResult
- [ ] **Step 3: Update GoalsRepository** — wrap all methods with apiCall, return ApiResult
- [ ] **Step 4: Update remaining repositories** (Recipe, Weight, Supplement, Stats, Preferences) — same pattern
- [ ] **Step 5: Verify shared module compiles**

Run: `cd mobile && ./gradlew :shared:compileKotlinAndroid`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add mobile/shared/src/commonMain/kotlin/com/bissbilanz/repository/
git commit -m "refactor(android): update repositories to return ApiResult for structured error handling"
```

---

## Chunk 2: Type-Safe Navigation

### Task 4: Define type-safe route objects

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/navigation/AppNavigation.kt`

Replace the `Screen` sealed class with `@Serializable` route objects:

- [ ] **Step 1: Replace Screen sealed class and route definitions**

```kotlin
package com.bissbilanz.android.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import androidx.navigation.toRoute
import kotlinx.serialization.Serializable

// Bottom nav screens
@Serializable data object DashboardRoute
@Serializable data object FoodsRoute
@Serializable data object FavoritesRoute
@Serializable data object InsightsRoute
@Serializable data object SettingsRoute

// Detail screens
@Serializable data class FoodDetailRoute(val foodId: String)
@Serializable data class DayLogRoute(val date: String)
@Serializable data class RecipeDetailRoute(val recipeId: String)

// Full-screen routes
@Serializable data object ScannerRoute
@Serializable data object RecipesRoute
@Serializable data object WeightRoute
@Serializable data object SupplementsRoute
@Serializable data object CalendarRoute
@Serializable data object MaintenanceRoute

data class BottomNavItem(
    val route: Any,
    val title: String,
    val icon: ImageVector,
)

val bottomNavItems = listOf(
    BottomNavItem(DashboardRoute, "Home", Icons.Default.Home),
    BottomNavItem(FoodsRoute, "Foods", Icons.Default.Restaurant),
    BottomNavItem(FavoritesRoute, "Favorites", Icons.Default.Star),
    BottomNavItem(InsightsRoute, "Insights", Icons.Default.BarChart),
    BottomNavItem(SettingsRoute, "Settings", Icons.Default.Settings),
)

// Routes where bottom bar should be hidden
private fun shouldHideBottomBar(destination: androidx.navigation.NavDestination?): Boolean {
    if (destination == null) return false
    return destination.hasRoute<ScannerRoute>() ||
        destination.hasRoute<WeightRoute>() ||
        destination.hasRoute<SupplementsRoute>() ||
        destination.hasRoute<RecipesRoute>() ||
        destination.hasRoute<CalendarRoute>() ||
        destination.hasRoute<MaintenanceRoute>() ||
        destination.hasRoute<FoodDetailRoute>() ||
        destination.hasRoute<DayLogRoute>() ||
        destination.hasRoute<RecipeDetailRoute>()
}
```

- [ ] **Step 2: Update AppNavigation composable with NavHost using type-safe routes**

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination

            if (!shouldHideBottomBar(currentDestination)) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        NavigationBarItem(
                            icon = { Icon(item.icon, contentDescription = item.title) },
                            label = { Text(item.title) },
                            selected = currentDestination?.hasRoute(item.route::class) == true,
                            onClick = {
                                navController.navigate(item.route) {
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
            startDestination = DashboardRoute,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable<DashboardRoute> {
                com.bissbilanz.android.ui.screens.DashboardScreen(navController)
            }
            composable<FoodsRoute> {
                com.bissbilanz.android.ui.screens.FoodSearchScreen(navController)
            }
            composable<FavoritesRoute> {
                com.bissbilanz.android.ui.screens.FavoritesScreen(navController)
            }
            composable<InsightsRoute> {
                com.bissbilanz.android.ui.screens.InsightsScreen()
            }
            composable<SettingsRoute> {
                com.bissbilanz.android.ui.screens.SettingsScreen(navController)
            }
            composable<FoodDetailRoute> { backStackEntry ->
                val route = backStackEntry.toRoute<FoodDetailRoute>()
                com.bissbilanz.android.ui.screens.FoodDetailScreen(route.foodId, navController)
            }
            composable<DayLogRoute> { backStackEntry ->
                val route = backStackEntry.toRoute<DayLogRoute>()
                com.bissbilanz.android.ui.screens.DayLogScreen(route.date, navController)
            }
            composable<ScannerRoute> {
                com.bissbilanz.android.ui.screens.BarcodeScannerScreen(navController)
            }
            composable<RecipesRoute> {
                com.bissbilanz.android.ui.screens.RecipeListScreen(navController)
            }
            composable<RecipeDetailRoute> { backStackEntry ->
                val route = backStackEntry.toRoute<RecipeDetailRoute>()
                com.bissbilanz.android.ui.screens.RecipeDetailScreen(route.recipeId, navController)
            }
            composable<WeightRoute> {
                com.bissbilanz.android.ui.screens.WeightScreen(navController)
            }
            composable<SupplementsRoute> {
                com.bissbilanz.android.ui.screens.SupplementsScreen(navController)
            }
            composable<CalendarRoute> {
                com.bissbilanz.android.ui.screens.CalendarScreen(navController)
            }
            composable<MaintenanceRoute> {
                com.bissbilanz.android.ui.screens.MaintenanceScreen(navController)
            }
        }
    }
}
```

- [ ] **Step 3: Verify AppNavigation compiles**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin 2>&1 | head -50`

### Task 5: Update all screen navigate() calls to use type-safe routes

**Files to modify** (every screen that calls `navController.navigate()`):

- `DashboardScreen.kt` — `navigate("scanner")` → `navigate(ScannerRoute)`, `navigate("foods")` → `navigate(FoodsRoute)`, `navigate("daylog/$selectedDate")` → `navigate(DayLogRoute(selectedDate.toString()))`
- `DayLogScreen.kt` — `navigate("foods")` → `navigate(FoodsRoute)`
- `FoodDetailScreen.kt` — no navigate calls (uses popBackStack only)
- `FoodSearchScreen.kt` — `navigate("food/$id")` → `navigate(FoodDetailRoute(id))`
- `FavoritesScreen.kt` — `navigate("food/$id")` → `navigate(FoodDetailRoute(id))`, `navigate("recipe/$id")` → `navigate(RecipeDetailRoute(id))`
- `SettingsScreen.kt` — `navigate("weight")` → `navigate(WeightRoute)`, `navigate("supplements")` → `navigate(SupplementsRoute)`, `navigate("recipes")` → `navigate(RecipesRoute)`, `navigate("calendar")` → `navigate(CalendarRoute)`, `navigate("maintenance")` → `navigate(MaintenanceRoute)`
- `RecipeListScreen.kt` — `navigate("recipe/$id")` → `navigate(RecipeDetailRoute(id))`
- `BarcodeScannerScreen.kt` — `navigate("food/$id")` → `navigate(FoodDetailRoute(id))`
- `WeightScreen.kt`, `SupplementsScreen.kt`, `CalendarScreen.kt`, `MaintenanceScreen.kt` — check for any navigate calls

Each screen needs the import: `import com.bissbilanz.android.navigation.*`

- [ ] **Step 1: Update DashboardScreen.kt** — replace 3 string navigate calls
- [ ] **Step 2: Update DayLogScreen.kt** — replace 1 string navigate call
- [ ] **Step 3: Update FoodSearchScreen.kt** — replace food detail navigate calls
- [ ] **Step 4: Update FavoritesScreen.kt** — replace food/recipe detail navigate calls
- [ ] **Step 5: Update SettingsScreen.kt** — replace 5 string navigate calls
- [ ] **Step 6: Update RecipeListScreen.kt** — replace recipe detail navigate calls
- [ ] **Step 7: Update BarcodeScannerScreen.kt** — replace food detail navigate calls
- [ ] **Step 8: Update remaining screens** (Weight, Supplements, Calendar, Maintenance) — check and replace any navigate calls
- [ ] **Step 9: Verify full build**

Run: `cd mobile && ./gradlew androidApp:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 10: Commit**

```bash
git add mobile/androidApp/
git commit -m "refactor(android): migrate to type-safe navigation routes"
```

---

## Chunk 3: Unified UiState Pattern

### Task 6: Consolidate DashboardViewModel

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/viewmodels/DashboardViewModel.kt`
- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/DashboardScreen.kt`

- [ ] **Step 1: Refactor DashboardViewModel to single UiState**

```kotlin
package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.api.onError
import com.bissbilanz.api.onSuccess
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.*

data class DashboardUiState(
    val selectedDate: LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault()),
    val entries: List<Entry> = emptyList(),
    val goals: Goals? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

class DashboardViewModel(
    private val entryRepo: EntryRepository,
    private val goalsRepo: GoalsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadData()
    }

    fun previousDay() {
        _uiState.update { it.copy(selectedDate = it.selectedDate.minus(1, DateTimeUnit.DAY)) }
        loadData()
    }

    fun nextDay() {
        _uiState.update { it.copy(selectedDate = it.selectedDate.plus(1, DateTimeUnit.DAY)) }
        loadData()
    }

    fun goToToday() {
        _uiState.update { it.copy(selectedDate = Clock.System.todayIn(TimeZone.currentSystemDefault())) }
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val date = _uiState.value.selectedDate.toString()
            entryRepo.loadEntries(date)
                .onSuccess { entries -> _uiState.update { it.copy(entries = entries) } }
                .onError { msg, _ -> _uiState.update { it.copy(error = msg) } }
            goalsRepo.loadGoals()
                .onSuccess { goals -> _uiState.update { it.copy(goals = goals) } }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
```

- [ ] **Step 2: Update DashboardScreen.kt to use uiState**

Replace individual `collectAsStateWithLifecycle()` calls with single state:

```kotlin
val uiState by viewModel.uiState.collectAsStateWithLifecycle()
// Then use: uiState.entries, uiState.goals, uiState.selectedDate, uiState.isLoading
```

### Task 7: Consolidate DayLogViewModel

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/viewmodels/DayLogViewModel.kt`
- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/DayLogScreen.kt`

- [ ] **Step 1: Refactor DayLogViewModel to single UiState**

```kotlin
data class DayLogUiState(
    val entries: List<Entry> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)
```

- [ ] **Step 2: Update DayLogScreen.kt to use uiState**

### Task 8: Consolidate FoodSearchViewModel

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/viewmodels/FoodSearchViewModel.kt`
- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/FoodSearchScreen.kt`

- [ ] **Step 1: Refactor FoodSearchViewModel to single UiState**

```kotlin
data class FoodSearchUiState(
    val query: String = "",
    val searchResults: List<Food> = emptyList(),
    val recentFoods: List<Food> = emptyList(),
    val favorites: List<Food> = emptyList(),
    val isSearching: Boolean = false,
    val selectedTab: Int = 0,
    val snackbarMessage: String? = null,
)
```

- [ ] **Step 2: Update FoodSearchScreen.kt to use uiState**

### Task 9: Consolidate FavoritesViewModel

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/viewmodels/FavoritesViewModel.kt`
- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/FavoritesScreen.kt`

- [ ] **Step 1: Refactor FavoritesViewModel to single UiState**

```kotlin
data class FavoritesUiState(
    val favorites: List<Food> = emptyList(),
    val recipes: List<Recipe> = emptyList(),
    val isLoading: Boolean = true,
    val selectedTab: Int = 0,
    val snackbarMessage: String? = null,
)
```

- [ ] **Step 2: Update FavoritesScreen.kt to use uiState**

### Task 10: Consolidate InsightsViewModel

**Files:**

- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/viewmodels/InsightsViewModel.kt`
- Modify: `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/InsightsScreen.kt`

- [ ] **Step 1: Refactor InsightsViewModel to single UiState**

```kotlin
data class InsightsUiState(
    val weeklyStats: MacroTotals? = null,
    val monthlyStats: MacroTotals? = null,
    val streaks: StreaksResponse? = null,
    val topFoods: List<TopFoodEntry> = emptyList(),
    val dailyStats: List<DailyStatsEntry> = emptyList(),
    val isLoading: Boolean = true,
    val selectedRange: Int = 0,
)
```

- [ ] **Step 2: Update InsightsScreen.kt to use uiState**

- [ ] **Step 3: Verify full build**

Run: `cd mobile && ./gradlew androidApp:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add mobile/androidApp/ mobile/shared/
git commit -m "refactor(android): consolidate ViewModels to single UiState pattern"
```

---

## Chunk 4: Final Verification

### Task 11: Full build and lint check

- [ ] **Step 1: Run ktlint**

Run: `cd mobile && ./gradlew :shared:ktlintCheck :androidApp:ktlintCheck`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Fix any ktlint issues**

Run: `cd mobile && ./gradlew :shared:ktlintFormat :androidApp:ktlintFormat`

- [ ] **Step 3: Run full build**

Run: `cd mobile && ./gradlew androidApp:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(android): fix lint issues after modernization"
```
