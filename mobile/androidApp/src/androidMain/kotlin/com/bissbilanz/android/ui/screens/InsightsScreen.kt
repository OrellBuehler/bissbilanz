package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.*
import com.bissbilanz.repository.StatsRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.datetime.*
import org.koin.compose.koinInject

@Composable
fun InsightsScreen() {
    val statsRepo: StatsRepository = koinInject()
    var weeklyStats by remember { mutableStateOf<MacroTotals?>(null) }
    var monthlyStats by remember { mutableStateOf<MacroTotals?>(null) }
    var streaks by remember { mutableStateOf<StreaksResponse?>(null) }
    var topFoods by remember { mutableStateOf<List<TopFoodEntry>>(emptyList()) }
    var dailyStats by remember { mutableStateOf<List<DailyStatsEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var selectedRange by remember { mutableIntStateOf(0) }
    val ranges = listOf("7 Days", "30 Days")

    LaunchedEffect(selectedRange) {
        isLoading = true
        val days = if (selectedRange == 0) 7 else 30
        val startDate = today.minus(days, DateTimeUnit.DAY).toString()
        val endDate = today.toString()

        try {
            coroutineScope {
                val weeklyDeferred = async {
                    try {
                        statsRepo.getWeeklyStats().stats
                    } catch (_: Exception) {
                        null
                    }
                }
                val monthlyDeferred = async {
                    try {
                        statsRepo.getMonthlyStats().stats
                    } catch (_: Exception) {
                        null
                    }
                }
                val streaksDeferred = async {
                    try {
                        statsRepo.getStreaks()
                    } catch (_: Exception) {
                        null
                    }
                }
                val topFoodsDeferred = async {
                    try {
                        statsRepo.getTopFoods(days).data
                    } catch (_: Exception) {
                        emptyList()
                    }
                }
                val dailyStatsDeferred = async {
                    try {
                        statsRepo.getDailyStats(startDate, endDate).data
                    } catch (_: Exception) {
                        emptyList()
                    }
                }

                weeklyStats = weeklyDeferred.await()
                monthlyStats = monthlyDeferred.await()
                streaks = streaksDeferred.await()
                topFoods = topFoodsDeferred.await()
                dailyStats = dailyStatsDeferred.await()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
    ) {
        Text("Insights", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(12.dp))

        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            ranges.forEachIndexed { index, label ->
                SegmentedButton(
                    selected = selectedRange == index,
                    onClick = { selectedRange = index },
                    shape = SegmentedButtonDefaults.itemShape(index, ranges.size),
                ) {
                    Text(label)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Streaks
        streaks?.let { s ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Streaks", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "${s.currentStreak}",
                                style = MaterialTheme.typography.headlineLarge,
                                color = CaloriesBlue,
                                fontWeight = FontWeight.Bold,
                            )
                            Text("Current", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "${s.longestStreak}",
                                style = MaterialTheme.typography.headlineLarge,
                                color = FiberGreen,
                                fontWeight = FontWeight.Bold,
                            )
                            Text("Longest", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Calorie Trend Chart
        if (dailyStats.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Calorie Trend", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    SimpleLineChart(
                        data = dailyStats.map { it.calories.toFloat() },
                        color = CaloriesBlue,
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        val avgCal = dailyStats.map { it.calories }.average()
                        Text(
                            "Avg: ${avgCal.toInt()} cal",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "${dailyStats.size} days",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Weekly vs Monthly comparison
        if (weeklyStats != null && monthlyStats != null) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Average Comparison", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("", modifier = Modifier.weight(1f))
                        Text(
                            "Weekly",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "Monthly",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))

                    ComparisonRow("Calories", weeklyStats!!.calories, monthlyStats!!.calories, "kcal", CaloriesBlue)
                    ComparisonRow("Protein", weeklyStats!!.protein, monthlyStats!!.protein, "g", ProteinRed)
                    ComparisonRow("Carbs", weeklyStats!!.carbs, monthlyStats!!.carbs, "g", CarbsOrange)
                    ComparisonRow("Fat", weeklyStats!!.fat, monthlyStats!!.fat, "g", FatYellow)
                    ComparisonRow("Fiber", weeklyStats!!.fiber, monthlyStats!!.fiber, "g", FiberGreen)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Top foods
        if (topFoods.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Top Foods", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                    topFoods.forEachIndexed { i, f ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "${i + 1}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.width(28.dp),
                                )
                                Text(f.foodName, modifier = Modifier.weight(1f))
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("${f.count}x", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                                Text(
                                    "${f.calories.toInt()} cal",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (i < topFoods.lastIndex) {
                            HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
fun SimpleLineChart(
    data: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    if (data.isEmpty()) return
    val maxVal = data.max().coerceAtLeast(1f)
    val minVal = data.min()

    Canvas(modifier = modifier) {
        val stepX = size.width / (data.size - 1).coerceAtLeast(1)
        val range = (maxVal - minVal).coerceAtLeast(1f)
        val padding = 8f

        val path = Path()
        data.forEachIndexed { i, value ->
            val x = i * stepX
            val y = size.height - padding - ((value - minVal) / range) * (size.height - padding * 2)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }

        drawPath(path, color = color, style = Stroke(width = 3f, cap = StrokeCap.Round))

        data.forEachIndexed { i, value ->
            val x = i * stepX
            val y = size.height - padding - ((value - minVal) / range) * (size.height - padding * 2)
            drawCircle(color = color, radius = 3f, center = Offset(x, y))
        }
    }
}

@Composable
fun ComparisonRow(
    label: String,
    weekly: Double,
    monthly: Double,
    unit: String,
    color: Color,
) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, color = color, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("${weekly.toInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("${monthly.toInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
    }
}
