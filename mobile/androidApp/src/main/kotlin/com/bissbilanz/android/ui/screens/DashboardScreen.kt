package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.ui.components.MacroRing
import com.bissbilanz.android.ui.components.MealCard
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@Composable
fun DashboardScreen(navController: NavController) {
    val entryRepo: EntryRepository = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val entries by entryRepo.entries.collectAsStateWithLifecycle()
    val goals by goalsRepo.goals.collectAsStateWithLifecycle()

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

    LaunchedEffect(today) {
        entryRepo.loadEntries(today)
        goalsRepo.loadGoals()
    }

    val totalCalories = entries.sumOf { it.food?.calories?.times(it.servings) ?: it.quickCalories?.times(it.servings) ?: 0.0 }
    val totalProtein = entries.sumOf { it.food?.protein?.times(it.servings) ?: it.quickProtein?.times(it.servings) ?: 0.0 }
    val totalCarbs = entries.sumOf { it.food?.carbs?.times(it.servings) ?: it.quickCarbs?.times(it.servings) ?: 0.0 }
    val totalFat = entries.sumOf { it.food?.fat?.times(it.servings) ?: it.quickFat?.times(it.servings) ?: 0.0 }
    val totalFiber = entries.sumOf { it.food?.fiber?.times(it.servings) ?: it.quickFiber?.times(it.servings) ?: 0.0 }

    Scaffold(
        floatingActionButton = {
            Column {
                SmallFloatingActionButton(
                    onClick = { navController.navigate("scanner") },
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    Icon(Icons.Default.QrCodeScanner, "Scan barcode")
                }
                Spacer(modifier = Modifier.height(12.dp))
                FloatingActionButton(
                    onClick = { navController.navigate("foods") }
                ) {
                    Icon(Icons.Default.Add, "Add food")
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text("Today", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))

            // Macro rings
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                MacroRing("Cal", totalCalories, goals?.calorieGoal ?: 2000.0, CaloriesBlue)
                MacroRing("Protein", totalProtein, goals?.proteinGoal ?: 150.0, ProteinRed)
                MacroRing("Carbs", totalCarbs, goals?.carbGoal ?: 250.0, CarbsOrange)
                MacroRing("Fat", totalFat, goals?.fatGoal ?: 65.0, FatYellow)
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Entries grouped by meal
            val mealGroups = entries.groupBy { it.mealType }
            mealGroups.forEach { (meal, mealEntries) ->
                MealCard(meal, mealEntries) {
                    navController.navigate("daylog/$today")
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (entries.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No entries yet today.\nTap + to add food.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
