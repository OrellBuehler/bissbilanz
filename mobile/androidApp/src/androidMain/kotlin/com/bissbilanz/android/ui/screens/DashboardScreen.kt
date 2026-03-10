package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import kotlinx.datetime.*
import org.koin.compose.koinInject

@Composable
fun DashboardScreen(navController: NavController) {
    val entryRepo: EntryRepository = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val entries by entryRepo.entries.collectAsStateWithLifecycle()
    val goals by goalsRepo.goals.collectAsStateWithLifecycle()

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var selectedDate by remember { mutableStateOf(today) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(selectedDate) {
        isLoading = true
        try {
            entryRepo.loadEntries(selectedDate.toString())
            goalsRepo.loadGoals()
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
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
    ) { padding ->
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
                IconButton(onClick = {
                    selectedDate = selectedDate.minus(1, DateTimeUnit.DAY)
                }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous day")
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(dateLabel, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    if (selectedDate != today) {
                        TextButton(onClick = { selectedDate = today }) {
                            Text("Go to today")
                        }
                    }
                }
                IconButton(onClick = {
                    selectedDate = selectedDate.plus(1, DateTimeUnit.DAY)
                }) {
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
                        Text(
                            "No entries yet.\nTap + to add food.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}
