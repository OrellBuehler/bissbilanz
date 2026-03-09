package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.*
import com.bissbilanz.repository.StatsRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun InsightsScreen() {
    val statsRepo: StatsRepository = koinInject()
    var weeklyStats by remember { mutableStateOf<MacroTotals?>(null) }
    var monthlyStats by remember { mutableStateOf<MacroTotals?>(null) }
    var streaks by remember { mutableStateOf<StreaksResponse?>(null) }
    var topFoods by remember { mutableStateOf<List<TopFoodEntry>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scope.launch { weeklyStats = try { statsRepo.getWeeklyStats().stats } catch (_: Exception) { null } }
        scope.launch { monthlyStats = try { statsRepo.getMonthlyStats().stats } catch (_: Exception) { null } }
        scope.launch { streaks = try { statsRepo.getStreaks() } catch (_: Exception) { null } }
        scope.launch { topFoods = try { statsRepo.getTopFoods().data } catch (_: Exception) { emptyList() } }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("Insights", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        // Streaks
        streaks?.let { s ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Streaks", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                            Text("${s.currentStreak}", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary)
                            Text("Current", style = MaterialTheme.typography.labelSmall)
                        }
                        Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                            Text("${s.longestStreak}", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.tertiary)
                            Text("Longest", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Weekly avg
        weeklyStats?.let { w ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Weekly Average", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    MacroRow("Calories", w.calories, "kcal", CaloriesBlue)
                    MacroRow("Protein", w.protein, "g", ProteinRed)
                    MacroRow("Carbs", w.carbs, "g", CarbsOrange)
                    MacroRow("Fat", w.fat, "g", FatYellow)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Top foods
        if (topFoods.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Top Foods (7 days)", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    topFoods.forEachIndexed { i, f ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("${i + 1}. ${f.foodName}", modifier = Modifier.weight(1f))
                            Text("${f.count}x · ${f.calories.toInt()} cal")
                        }
                    }
                }
            }
        }
    }
}
