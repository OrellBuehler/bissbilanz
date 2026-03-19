package com.bissbilanz.android.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.CalendarHeatmap
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.components.MacroRadarChart
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RadarAxis
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.model.DailyStatsEntry
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealBreakdownEntry
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun InsightsScreen() {
    val viewModel: InsightsViewModel = koinViewModel()
    val refreshManager: RefreshManager = koinInject()
    val weeklyStats by viewModel.weeklyStats.collectAsStateWithLifecycle()
    val monthlyStats by viewModel.monthlyStats.collectAsStateWithLifecycle()
    val streaks by viewModel.streaks.collectAsStateWithLifecycle()
    val topFoods by viewModel.topFoods.collectAsStateWithLifecycle()
    val dailyStats by viewModel.dailyStats.collectAsStateWithLifecycle()
    val mealBreakdown by viewModel.mealBreakdown.collectAsStateWithLifecycle()
    val goals by viewModel.goals.collectAsStateWithLifecycle()
    val selectedRange by viewModel.selectedRange.collectAsStateWithLifecycle()
    val calendarDays by viewModel.calendarDays.collectAsStateWithLifecycle()
    val calendarMonth by viewModel.calendarMonth.collectAsStateWithLifecycle()
    val calendarYear by viewModel.calendarYear.collectAsStateWithLifecycle()

    val ranges = listOf("7 Days", "30 Days", "90 Days")

    PullToRefreshWrapper(
        onRefresh = {
            refreshManager.refreshAll()
            viewModel.loadData()
            viewModel.loadCalendarStats()
        },
        modifier = Modifier.fillMaxSize(),
    ) {
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
                                Text(
                                    "Current",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "${s.longestStreak}",
                                    style = MaterialTheme.typography.headlineLarge,
                                    color = FiberGreen,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    "Longest",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // 1. Trends
            if (dailyStats.isNotEmpty()) {
                CollapsibleCard(title = "Trends", sectionId = "trends") {
                    Text("Calorie Trend", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                    SimpleLineChart(
                        data = dailyStats.map { it.calories.toFloat() },
                        color = CaloriesBlue,
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        val avgCal = dailyStats.map { it.calories }.average()
                        Text(
                            "Avg: ${avgCal.roundToInt()} cal",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "${dailyStats.size} days",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Macro Trends", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))

                    MacroTrendRow("Protein", dailyStats.map { it.protein.toFloat() }, "g", ProteinRed)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Carbs", dailyStats.map { it.carbs.toFloat() }, "g", CarbsOrange)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Fat", dailyStats.map { it.fat.toFloat() }, "g", FatYellow)
                    Spacer(modifier = Modifier.height(12.dp))
                    MacroTrendRow("Fiber", dailyStats.map { it.fiber.toFloat() }, "g", FiberGreen)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // 2. Goal Adherence
            if (goals != null && dailyStats.isNotEmpty()) {
                GoalAdherenceCard(dailyStats, goals!!)
                Spacer(modifier = Modifier.height(12.dp))
            }

            // 3. Calendar Heatmap
            if (goals != null) {
                CollapsibleCard(title = "Calendar Heatmap", sectionId = "calendar") {
                    CalendarHeatmap(
                        days = calendarDays,
                        calorieGoal = goals!!.calorieGoal,
                        month = calendarMonth,
                        year = calendarYear,
                        onPrevMonth = { viewModel.prevMonth() },
                        onNextMonth = { viewModel.nextMonth() },
                        onDayClick = { },
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // 4. Macro Balance Radar
            if (goals != null && dailyStats.isNotEmpty()) {
                CollapsibleCard(title = "Macro Balance", sectionId = "radar") {
                    val g = goals!!
                    val avgCal = dailyStats.map { it.calories }.average()
                    val avgPro = dailyStats.map { it.protein }.average()
                    val avgCarb = dailyStats.map { it.carbs }.average()
                    val avgFat = dailyStats.map { it.fat }.average()
                    val avgFib = dailyStats.map { it.fiber }.average()

                    val radarAxes =
                        listOf(
                            RadarAxis("Cal", (avgCal / g.calorieGoal.coerceAtLeast(1.0)).toFloat(), CaloriesBlue),
                            RadarAxis("Protein", (avgPro / g.proteinGoal.coerceAtLeast(1.0)).toFloat(), ProteinRed),
                            RadarAxis("Carbs", (avgCarb / g.carbGoal.coerceAtLeast(1.0)).toFloat(), CarbsOrange),
                            RadarAxis("Fat", (avgFat / g.fatGoal.coerceAtLeast(1.0)).toFloat(), FatYellow),
                            RadarAxis("Fiber", (avgFib / g.fiberGoal.coerceAtLeast(1.0)).toFloat(), FiberGreen),
                        )
                    MacroRadarChart(axes = radarAxes)
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // 5. Meal Distribution
            if (mealBreakdown.isNotEmpty()) {
                val totalCalories = mealBreakdown.sumOf { it.calories }
                if (totalCalories > 0) {
                    CollapsibleCard(title = "Meal Distribution", sectionId = "meals") {
                        SimplePieChart(
                            entries = mealBreakdown,
                            modifier = Modifier.fillMaxWidth().height(180.dp),
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        MealBreakdownLegend(mealBreakdown, totalCalories)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }

            // 6. Top Foods
            if (topFoods.isNotEmpty()) {
                CollapsibleCard(title = "Top Foods", sectionId = "topfoods") {
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
                                    "${f.calories.roundToInt()} cal",
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

            Spacer(modifier = Modifier.height(16.dp))
        }
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

    val revealFraction = remember { Animatable(0f) }
    LaunchedEffect(data) {
        revealFraction.snapTo(0f)
        revealFraction.animateTo(1f, animationSpec = tween(500, easing = EaseOutCubic))
    }

    Canvas(modifier = modifier) {
        clipRect(right = size.width * revealFraction.value) {
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
            Text("${weekly.roundToInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("${monthly.roundToInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(
                "$trendArrow ${abs(diffPercent).roundToInt()}%",
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
                "Avg: ${avg.roundToInt()} $unit",
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

    val sweepFraction = remember { Animatable(0f) }
    LaunchedEffect(entries) {
        sweepFraction.snapTo(0f)
        sweepFraction.animateTo(1f, animationSpec = tween(600, easing = EaseOutCubic))
    }

    Canvas(modifier = modifier) {
        val diameter = minOf(size.width, size.height) * 0.8f
        val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
        var startAngle = -90f

        entries.forEachIndexed { index, entry ->
            val sweep = (entry.calories.toFloat() / total) * 360f * sweepFraction.value
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
        val pct = (entry.calories / totalCalories * 100).roundToInt()
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
                "${entry.calories.roundToInt()} kcal ($pct%)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun GoalAdherenceCard(
    dailyStats: List<DailyStatsEntry>,
    goals: Goals,
) {
    val totalDays = dailyStats.size
    if (totalDays == 0) return

    data class GoalStat(
        val label: String,
        val strictDays: Int,
        val tolerantDays: Int,
        val color: Color,
    )

    val stats =
        listOf(
            GoalStat(
                "Calories",
                strictDays = dailyStats.count { it.calories <= goals.calorieGoal },
                tolerantDays =
                    dailyStats.count {
                        it.calories <= goals.calorieGoal * 1.1 && it.calories >= goals.calorieGoal * 0.9
                    },
                CaloriesBlue,
            ),
            GoalStat(
                "Protein",
                strictDays = dailyStats.count { it.protein >= goals.proteinGoal },
                tolerantDays = dailyStats.count { it.protein >= goals.proteinGoal * 0.9 },
                ProteinRed,
            ),
            GoalStat(
                "Carbs",
                strictDays = dailyStats.count { it.carbs <= goals.carbGoal },
                tolerantDays = dailyStats.count { it.carbs <= goals.carbGoal * 1.1 },
                CarbsOrange,
            ),
            GoalStat(
                "Fat",
                strictDays = dailyStats.count { it.fat <= goals.fatGoal },
                tolerantDays = dailyStats.count { it.fat <= goals.fatGoal * 1.1 },
                FatYellow,
            ),
            GoalStat(
                "Fiber",
                strictDays = dailyStats.count { it.fiber >= goals.fiberGoal },
                tolerantDays = dailyStats.count { it.fiber >= goals.fiberGoal * 0.9 },
                FiberGreen,
            ),
        )

    CollapsibleCard(title = "Goal Adherence", sectionId = "goals") {
        Text(
            "Days within goal range ($totalDays day period)",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(12.dp))

        stats.forEach { stat ->
            val tolerantPct = stat.tolerantDays.toFloat() / totalDays
            val strictPct = stat.strictDays.toFloat() / totalDays
            val animatedPct by animateFloatAsState(
                targetValue = tolerantPct.coerceIn(0f, 1f),
                animationSpec = GentleSpring,
                label = "goal-${stat.label}",
            )
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
                                .fillMaxWidth(animatedPct)
                                .clip(RoundedCornerShape(4.dp))
                                .background(stat.color),
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "${(tolerantPct * 100).roundToInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(36.dp),
                        textAlign = TextAlign.End,
                    )
                    Text(
                        "${(strictPct * 100).roundToInt()}% strict",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(60.dp),
                        textAlign = TextAlign.End,
                    )
                }
            }
        }
    }
}
