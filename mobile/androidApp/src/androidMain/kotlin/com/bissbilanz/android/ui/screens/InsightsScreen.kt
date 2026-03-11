package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.model.DailyStatsEntry
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealBreakdownEntry
import org.koin.androidx.compose.koinViewModel
import kotlin.math.abs

@Composable
fun InsightsScreen() {
    val viewModel: InsightsViewModel = koinViewModel()
    val weeklyStats by viewModel.weeklyStats.collectAsStateWithLifecycle()
    val monthlyStats by viewModel.monthlyStats.collectAsStateWithLifecycle()
    val streaks by viewModel.streaks.collectAsStateWithLifecycle()
    val topFoods by viewModel.topFoods.collectAsStateWithLifecycle()
    val dailyStats by viewModel.dailyStats.collectAsStateWithLifecycle()
    val mealBreakdown by viewModel.mealBreakdown.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val selectedRange by viewModel.selectedRange.collectAsStateWithLifecycle()

    val ranges = listOf("7 Days", "30 Days")

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
                    onClick = { viewModel.selectRange(index) },
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

        // Macro Trend Charts
        if (dailyStats.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Macro Trends", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))

                    MacroTrendRow("Protein", dailyStats.map { it.protein.toFloat() }, "g", ProteinRed)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Carbs", dailyStats.map { it.carbs.toFloat() }, "g", CarbsOrange)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Fat", dailyStats.map { it.fat.toFloat() }, "g", FatYellow)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Fiber", dailyStats.map { it.fiber.toFloat() }, "g", FiberGreen)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Meal Breakdown Pie Chart
        if (mealBreakdown.isNotEmpty()) {
            val totalCalories = mealBreakdown.sumOf { it.calories }
            if (totalCalories > 0) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Meal Breakdown",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        SimplePieChart(
                            entries = mealBreakdown,
                            modifier = Modifier.fillMaxWidth().height(180.dp),
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        MealBreakdownLegend(mealBreakdown, totalCalories)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Goal Achievement Rate
        if (goals != null && dailyStats.isNotEmpty()) {
            GoalAchievementCard(dailyStats, goals!!)
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Weekly vs Monthly comparison
        if (weeklyStats != null && monthlyStats != null) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Average Comparison", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
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
                        Spacer(modifier = Modifier.width(52.dp))
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
private fun ComparisonRow(
    label: String,
    weekly: Double,
    monthly: Double,
    unit: String,
    color: Color,
) {
    val diff = weekly - monthly
    val diffPercent = if (monthly > 0) (diff / monthly * 100) else 0.0
    val trendUp = diff > 0
    val trendArrow =
        if (trendUp) {
            "\u2191"
        } else if (diff < 0) {
            "\u2193"
        } else {
            "\u2192"
        }
    val trendColor =
        if (trendUp) {
            FiberGreen
        } else if (diff < 0) {
            ProteinRed
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        }
    val maxVal = maxOf(weekly, monthly).coerceAtLeast(1.0)

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = color, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("${weekly.toInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("${monthly.toInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(
                "$trendArrow ${abs(diffPercent).toInt()}%",
                color = trendColor,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(52.dp),
                textAlign = TextAlign.End,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth().height(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(2.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxHeight()
                            .fillMaxWidth((weekly / maxVal).toFloat().coerceIn(0f, 1f))
                            .clip(RoundedCornerShape(2.dp))
                            .background(color.copy(alpha = 0.7f)),
                )
            }
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(2.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxHeight()
                            .fillMaxWidth((monthly / maxVal).toFloat().coerceIn(0f, 1f))
                            .clip(RoundedCornerShape(2.dp))
                            .background(color.copy(alpha = 0.4f)),
                )
            }
        }
    }
}

@Composable
private fun MacroTrendRow(
    label: String,
    data: List<Float>,
    unit: String,
    color: Color,
) {
    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.SemiBold)
            val avg = if (data.isNotEmpty()) data.average() else 0.0
            Text(
                "Avg: ${avg.toInt()} $unit",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        SimpleLineChart(
            data = data,
            color = color,
            modifier = Modifier.fillMaxWidth().height(60.dp),
        )
    }
}

private val MealColors =
    listOf(
        Color(0xFF3B82F6),
        Color(0xFFEF4444),
        Color(0xFFF97316),
        Color(0xFFEAB308),
        Color(0xFF22C55E),
        Color(0xFF8B5CF6),
        Color(0xFFEC4899),
        Color(0xFF14B8A6),
    )

@Composable
private fun SimplePieChart(
    entries: List<MealBreakdownEntry>,
    modifier: Modifier = Modifier,
) {
    val total = entries.sumOf { it.calories }.toFloat()
    if (total <= 0f) return
    val surfaceColor = MaterialTheme.colorScheme.surfaceContainerLow

    Canvas(modifier = modifier) {
        val diameter = minOf(size.width, size.height) * 0.8f
        val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
        var startAngle = -90f

        entries.forEachIndexed { index, entry ->
            val sweep = (entry.calories.toFloat() / total) * 360f
            drawArc(
                color = MealColors[index % MealColors.size],
                startAngle = startAngle,
                sweepAngle = sweep,
                useCenter = true,
                topLeft = topLeft,
                size = Size(diameter, diameter),
            )
            startAngle += sweep
        }

        val innerDiameter = diameter * 0.5f
        val innerTopLeft = Offset((size.width - innerDiameter) / 2f, (size.height - innerDiameter) / 2f)
        drawOval(
            color = surfaceColor,
            topLeft = innerTopLeft,
            size = Size(innerDiameter, innerDiameter),
        )
    }
}

@Composable
private fun MealBreakdownLegend(
    entries: List<MealBreakdownEntry>,
    totalCalories: Double,
) {
    entries.forEachIndexed { index, entry ->
        val pct = (entry.calories / totalCalories * 100).toInt()
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(MealColors[index % MealColors.size]),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                entry.mealType.replaceFirstChar { it.uppercase() },
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            Text(
                "${entry.calories.toInt()} kcal ($pct%)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun GoalAchievementCard(
    dailyStats: List<DailyStatsEntry>,
    goals: Goals,
) {
    val totalDays = dailyStats.size
    if (totalDays == 0) return

    data class GoalStat(
        val label: String,
        val hitDays: Int,
        val color: Color,
    )

    val stats =
        listOf(
            GoalStat(
                "Calories",
                dailyStats.count { it.calories <= goals.calorieGoal * 1.05 && it.calories >= goals.calorieGoal * 0.9 },
                CaloriesBlue,
            ),
            GoalStat("Protein", dailyStats.count { it.protein >= goals.proteinGoal * 0.9 }, ProteinRed),
            GoalStat("Carbs", dailyStats.count { it.carbs <= goals.carbGoal * 1.1 }, CarbsOrange),
            GoalStat("Fat", dailyStats.count { it.fat <= goals.fatGoal * 1.1 }, FatYellow),
            GoalStat("Fiber", dailyStats.count { it.fiber >= goals.fiberGoal * 0.9 }, FiberGreen),
        )

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Goal Achievement", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Days within goal range ($totalDays day period)",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))

            stats.forEach { stat ->
                val pct = stat.hitDays.toFloat() / totalDays
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stat.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = stat.color,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.width(64.dp),
                    )
                    Box(
                        modifier =
                            Modifier
                                .weight(1f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                    ) {
                        Box(
                            modifier =
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth(pct.coerceIn(0f, 1f))
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(stat.color),
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "${(pct * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(36.dp),
                        textAlign = TextAlign.End,
                    )
                }
            }
        }
    }
}
