package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EntryEditSheet
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.SupplementsWidget
import com.bissbilanz.android.ui.components.WeightWidget
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.util.DefaultGoals
import com.bissbilanz.util.mealTypes
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedFiber
import com.bissbilanz.util.resolvedProtein
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.androidx.compose.koinViewModel

@Composable
fun DashboardScreen(navController: NavController) {
    val viewModel: DashboardViewModel = koinViewModel()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val selectedDate by viewModel.selectedDate.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()

    val prefs by viewModel.prefs.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearSnackbar()
        }
    }
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var showQuickAddSheet by remember { mutableStateOf(false) }

    val totalCalories = entries.sumOf { it.resolvedCalories() }
    val totalProtein = entries.sumOf { it.resolvedProtein() }
    val totalCarbs = entries.sumOf { it.resolvedCarbs() }
    val totalFat = entries.sumOf { it.resolvedFat() }
    val totalFiber = entries.sumOf { it.resolvedFiber() }

    val dateLabel =
        when (selectedDate) {
            today -> "Today"
            today.minus(1, DateTimeUnit.DAY) -> "Yesterday"
            today.plus(1, DateTimeUnit.DAY) -> "Tomorrow"
            else -> "${selectedDate.dayOfMonth} ${selectedDate.month.name.lowercase().replaceFirstChar {
                it.uppercase()
            }} ${selectedDate.year}"
        }

    Scaffold(
        floatingActionButton = {
            Column {
                SmallFloatingActionButton(
                    onClick = { navController.navigate("scanner") },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Icon(Icons.Default.QrCodeScanner, "Scan barcode")
                }
                Spacer(modifier = Modifier.height(12.dp))
                FloatingActionButton(
                    onClick = { showQuickAddSheet = true },
                ) {
                    Icon(Icons.Default.Add, "Add entry")
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { viewModel.previousDay() }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous day")
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(dateLabel, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        TextButton(
                            onClick = { viewModel.goToToday() },
                            enabled = selectedDate != today,
                            modifier =
                                Modifier
                                    .alpha(if (selectedDate != today) 1f else 0f)
                                    .then(
                                        if (selectedDate == today) {
                                            Modifier.semantics { invisibleToUser() }
                                        } else {
                                            Modifier
                                        },
                                    ),
                        ) {
                            Text("Go to today")
                        }
                    }
                    IconButton(onClick = { viewModel.nextDay() }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next day")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    MacroRing(
                        "Calories",
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
                        "Protein",
                        totalProtein,
                        goals?.proteinGoal ?: DefaultGoals.PROTEIN,
                        ProteinRed,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        "Carbs",
                        totalCarbs,
                        goals?.carbGoal ?: DefaultGoals.CARBS,
                        CarbsOrange,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        "Fat",
                        totalFat,
                        goals?.fatGoal ?: DefaultGoals.FAT,
                        FatYellow,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                    MacroRing(
                        "Fiber",
                        totalFiber,
                        goals?.fiberGoal ?: DefaultGoals.FIBER,
                        FiberGreen,
                        size = 56.dp,
                        strokeWidth = 5.dp,
                        showGoal = true,
                    )
                }

                Spacer(modifier = Modifier.height(28.dp))

                Crossfade(targetState = isLoading, label = "dashboard") { loading ->
                    if (loading) {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    } else {
                        Column {
                            val mealGroups = entries.groupBy { it.mealType }
                            val sortedMeals =
                                mealTypes.filter { mealGroups.containsKey(it) } +
                                    mealGroups.keys.filter { it !in mealTypes }

                            sortedMeals.forEach { meal ->
                                val mealEntries = mealGroups[meal] ?: return@forEach
                                MealCard(meal, mealEntries) {
                                    navController.navigate("daylog/$selectedDate")
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            if (entries.isEmpty()) {
                                Box(
                                    modifier =
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 48.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            "No entries yet.\nTap + to add food.",
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                        )
                                        Spacer(modifier = Modifier.height(16.dp))
                                        OutlinedButton(
                                            onClick = { viewModel.copyEntriesFromYesterday() },
                                        ) {
                                            Icon(Icons.Default.ContentCopy, "Copy", modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Copy from yesterday")
                                        }
                                    }
                                }
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

                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }
                }
            }
        }
    }
}
