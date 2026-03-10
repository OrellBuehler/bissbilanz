package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.EntryEditSheet
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@Composable
fun DashboardScreen(navController: NavController) {
    val viewModel: DashboardViewModel = koinViewModel()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val selectedDate by viewModel.selectedDate.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()

    val entryRepo: EntryRepository = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var showQuickAddSheet by remember { mutableStateOf(false) }

    fun entryCalories(entry: com.bissbilanz.model.Entry): Double {
        val food = entry.food
        val recipe = entry.recipe
        return when {
            food != null -> food.calories * entry.servings
            recipe != null -> {
                val ings = recipe.ingredients ?: emptyList()
                val totalCals = ings.sumOf { ing -> ing.food?.calories?.times(ing.quantity / (ing.food?.servingSize ?: 1.0)) ?: 0.0 }
                (totalCals / recipe.totalServings) * entry.servings
            }
            else -> (entry.quickCalories ?: 0.0) * entry.servings
        }
    }
    fun entryMacro(entry: com.bissbilanz.model.Entry, getter: (com.bissbilanz.model.Food) -> Double, quick: Double?): Double {
        val food = entry.food
        return if (food != null) getter(food) * entry.servings else (quick ?: 0.0) * entry.servings
    }

    val totalCalories = entries.sumOf { it.food?.calories?.times(it.servings) ?: it.quickCalories?.times(it.servings) ?: 0.0 }
    val totalProtein = entries.sumOf { it.food?.protein?.times(it.servings) ?: it.quickProtein?.times(it.servings) ?: 0.0 }
    val totalCarbs = entries.sumOf { it.food?.carbs?.times(it.servings) ?: it.quickCarbs?.times(it.servings) ?: 0.0 }
    val totalFat = entries.sumOf { it.food?.fat?.times(it.servings) ?: it.quickFat?.times(it.servings) ?: 0.0 }
    val totalFiber = entries.sumOf { it.food?.fiber?.times(it.servings) ?: it.quickFiber?.times(it.servings) ?: 0.0 }

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
                    onClick = { showQuickAddSheet = true },
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                ) {
                    Icon(Icons.Default.Edit, "Quick add")
                }
                Spacer(modifier = Modifier.height(12.dp))
                SmallFloatingActionButton(
                    onClick = { navController.navigate("scanner") },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Icon(Icons.Default.QrCodeScanner, "Scan barcode")
                }
                Spacer(modifier = Modifier.height(12.dp))
                FloatingActionButton(
                    onClick = { navController.navigate("foods") },
                ) {
                    Icon(Icons.Default.Add, "Add food")
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

        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
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
                    if (selectedDate != today) {
                        TextButton(onClick = { viewModel.goToToday() }) {
                            Text("Go to today")
                        }
                    }
                }
                IconButton(onClick = { viewModel.nextDay() }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next day")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                MacroRing("Cal", totalCalories, goals?.calorieGoal ?: 2000.0, CaloriesBlue, showGoal = true)
                MacroRing("Protein", totalProtein, goals?.proteinGoal ?: 150.0, ProteinRed, showGoal = true)
                MacroRing("Carbs", totalCarbs, goals?.carbGoal ?: 250.0, CarbsOrange, showGoal = true)
                MacroRing("Fat", totalFat, goals?.fatGoal ?: 65.0, FatYellow, showGoal = true)
                MacroRing("Fiber", totalFiber, goals?.fiberGoal ?: 30.0, FiberGreen, showGoal = true)
            }

            Spacer(modifier = Modifier.height(24.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            } else {
                val mealOrder = listOf("breakfast", "lunch", "dinner", "snack")
                val mealGroups = entries.groupBy { it.mealType }
                val sortedMeals =
                    mealOrder.filter { mealGroups.containsKey(it) } +
                        mealGroups.keys.filter { it !in mealOrder }

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
                                onClick = {
                                    scope.launch {
                                        try {
                                            val yesterday = selectedDate.minus(1, DateTimeUnit.DAY).toString()
                                            val count = entryRepo.copyEntries(yesterday, selectedDate.toString())
                                            snackbarHostState.showSnackbar("Copied $count entries from yesterday")
                                            viewModel.loadData()
                                        } catch (_: Exception) {
                                            snackbarHostState.showSnackbar("No entries to copy from yesterday")
                                        }
                                    }
                                },
                            ) {
                                Icon(Icons.Default.ContentCopy, "Copy", modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Copy from yesterday")
                            }
                        }
                    }
                }
            }
        }
    }
}
