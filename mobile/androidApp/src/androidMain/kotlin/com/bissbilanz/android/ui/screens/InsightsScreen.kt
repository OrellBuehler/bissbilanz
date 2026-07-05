package com.bissbilanz.android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.CalendarHeatmap
import com.bissbilanz.android.ui.components.CollapsibleCard
import com.bissbilanz.android.ui.components.MacroRadarChart
import com.bissbilanz.android.ui.components.MealColors
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.RadarAxis
import com.bissbilanz.android.ui.components.SimpleLineChart
import com.bissbilanz.android.ui.components.SimplePieChart
import com.bissbilanz.android.ui.components.insights.AdaptiveTDEECard
import com.bissbilanz.android.ui.components.insights.CaffeineSleepCard
import com.bissbilanz.android.ui.components.insights.CaloricLagCard
import com.bissbilanz.android.ui.components.insights.CalorieCyclingCard
import com.bissbilanz.android.ui.components.insights.CalorieFrontLoadingCard
import com.bissbilanz.android.ui.components.insights.DIIScoreCard
import com.bissbilanz.android.ui.components.insights.FoodDiversityCard
import com.bissbilanz.android.ui.components.insights.FoodSleepCard
import com.bissbilanz.android.ui.components.insights.MacroImpactCard
import com.bissbilanz.android.ui.components.insights.MealRegularityCard
import com.bissbilanz.android.ui.components.insights.MealTimingWeightCard
import com.bissbilanz.android.ui.components.insights.NOVAScoreCard
import com.bissbilanz.android.ui.components.insights.NutrientAdequacyCard
import com.bissbilanz.android.ui.components.insights.NutrientSleepCard
import com.bissbilanz.android.ui.components.insights.OmegaRatioCard
import com.bissbilanz.android.ui.components.insights.PlateauDetectionCard
import com.bissbilanz.android.ui.components.insights.PreSleepWindowCard
import com.bissbilanz.android.ui.components.insights.ProteinDistributionCard
import com.bissbilanz.android.ui.components.insights.SodiumWeightCard
import com.bissbilanz.android.ui.components.insights.TEFCard
import com.bissbilanz.android.ui.components.insights.WeekdayWeekendCard
import com.bissbilanz.android.ui.components.insights.WeightForecastCard
import com.bissbilanz.android.ui.components.mealTypeDisplayName
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.GentleSpring
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.viewmodels.InsightsViewModel
import com.bissbilanz.model.DailyStatsEntry
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MealBreakdownEntry
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.util.formatAsInt
import com.bissbilanz.util.formatDecimal1
import com.bissbilanz.util.formatNutrient
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
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
    val selectedTab by viewModel.selectedTab.collectAsStateWithLifecycle()
    val nutritionLoading by viewModel.nutritionLoading.collectAsStateWithLifecycle()
    val weightLoading by viewModel.weightLoading.collectAsStateWithLifecycle()
    val sleepLoading by viewModel.sleepLoading.collectAsStateWithLifecycle()

    val isLocalMode = viewModel.isLocalMode

    val ranges =
        listOf(
            stringResource(R.string.insights_range_7_days),
            stringResource(R.string.insights_range_30_days),
            stringResource(R.string.insights_range_90_days),
        )

    // Nutrition, Weight and Sleep analytics are now computed on-device from the
    // local DB (AnalyticsRepository -> LocalAnalytics), so every tab works in both
    // modes. Pairs of (ViewModel tab index, title).
    val tabs =
        listOf(
            0 to stringResource(R.string.insights_tab_overview),
            1 to stringResource(R.string.insights_tab_nutrition),
            2 to stringResource(R.string.weight_widget_title),
            3 to stringResource(R.string.sleep_section_title),
        )

    PullToRefreshWrapper(
        onRefresh = {
            refreshManager.refreshAll()
            viewModel.loadData()
            viewModel.loadCalendarStats()
            viewModel.loadSleepData()
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
            Text(
                stringResource(R.string.settings_nav_insights),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
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

            Spacer(modifier = Modifier.height(8.dp))

            ScrollableTabRow(
                selectedTabIndex = tabs.indexOfFirst { it.first == selectedTab }.coerceAtLeast(0),
                modifier = Modifier.fillMaxWidth(),
                edgePadding = 0.dp,
            ) {
                tabs.forEach { (index, title) ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { viewModel.selectTab(index) },
                        text = { Text(title) },
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))

            when (selectedTab) {
                0 -> {
                    // Streaks
                    streaks?.let { s ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(20.dp)) {
                                Text(
                                    stringResource(R.string.insights_streaks),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
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
                                            stringResource(R.string.insights_streaks_current),
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
                                            stringResource(R.string.insights_streaks_longest),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // 1. Trends
                    if (dailyStats.isNotEmpty()) {
                        CollapsibleCard(title = stringResource(R.string.insights_trends), sectionId = "trends") {
                            Text(
                                stringResource(R.string.insights_calorie_trend),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            SimpleLineChart(
                                data = dailyStats.map { it.calories.toFloat() },
                                color = CaloriesBlue,
                                modifier = Modifier.fillMaxWidth().height(120.dp),
                                unit = stringResource(R.string.insights_cal_unit),
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                val avgCal = dailyStats.map { it.calories }.average()
                                val calUnit = stringResource(R.string.insights_cal_unit)
                                Text(
                                    stringResource(R.string.insights_avg_value_unit, avgCal.formatAsInt(), calUnit),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    stringResource(R.string.insights_days_count, dailyStats.size),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                stringResource(R.string.insights_macro_trends),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            MacroTrendRow(stringResource(R.string.macro_protein), dailyStats.map { it.protein.toFloat() }, "g", ProteinRed)
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroTrendRow(stringResource(R.string.macro_carbs), dailyStats.map { it.carbs.toFloat() }, "g", CarbsOrange)
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroTrendRow(stringResource(R.string.macro_fat), dailyStats.map { it.fat.toFloat() }, "g", FatYellow)
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroTrendRow(stringResource(R.string.macro_fiber), dailyStats.map { it.fiber.toFloat() }, "g", FiberGreen)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // 2. Goal Adherence
                    if (goals != null && dailyStats.isNotEmpty()) {
                        GoalAdherenceCard(dailyStats, goals!!)
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // 3. Calendar Heatmap
                    if (goals != null) {
                        CollapsibleCard(title = stringResource(R.string.insights_calendar_heatmap), sectionId = "calendar") {
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
                        CollapsibleCard(title = stringResource(R.string.insights_macro_balance), sectionId = "radar") {
                            val g = goals!!
                            val avgCal = dailyStats.map { it.calories }.average()
                            val avgPro = dailyStats.map { it.protein }.average()
                            val avgCarb = dailyStats.map { it.carbs }.average()
                            val avgFat = dailyStats.map { it.fat }.average()
                            val avgFib = dailyStats.map { it.fiber }.average()

                            val radarAxes =
                                listOf(
                                    RadarAxis(
                                        stringResource(R.string.insights_radar_cal),
                                        (avgCal / g.calorieGoal.coerceAtLeast(1.0)).toFloat(),
                                        CaloriesBlue,
                                    ),
                                    RadarAxis(
                                        stringResource(R.string.macro_protein),
                                        (avgPro / g.proteinGoal.coerceAtLeast(1.0)).toFloat(),
                                        ProteinRed,
                                    ),
                                    RadarAxis(
                                        stringResource(R.string.macro_carbs),
                                        (avgCarb / g.carbGoal.coerceAtLeast(1.0)).toFloat(),
                                        CarbsOrange,
                                    ),
                                    RadarAxis(
                                        stringResource(R.string.macro_fat),
                                        (avgFat / g.fatGoal.coerceAtLeast(1.0)).toFloat(),
                                        FatYellow,
                                    ),
                                    RadarAxis(
                                        stringResource(R.string.macro_fiber),
                                        (avgFib / g.fiberGoal.coerceAtLeast(1.0)).toFloat(),
                                        FiberGreen,
                                    ),
                                )
                            MacroRadarChart(axes = radarAxes)
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // 5. Meal Distribution
                    if (mealBreakdown.isNotEmpty()) {
                        val totalCalories = mealBreakdown.sumOf { it.calories }
                        if (totalCalories > 0) {
                            CollapsibleCard(title = stringResource(R.string.insights_meal_distribution), sectionId = "meals") {
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
                        CollapsibleCard(title = stringResource(R.string.insights_top_foods), sectionId = "topfoods") {
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
                                        Text(
                                            stringResource(R.string.insights_count_x, f.count),
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            stringResource(R.string.format_kcal, f.calories.formatAsInt()),
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

                1 -> {
                    if (nutritionLoading) {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    } else {
                        val novaResult by viewModel.novaResult.collectAsStateWithLifecycle()
                        val omegaResult by viewModel.omegaResult.collectAsStateWithLifecycle()
                        val diiResult by viewModel.diiResult.collectAsStateWithLifecycle()
                        val tefResult by viewModel.tefResult.collectAsStateWithLifecycle()
                        val proteinDistResult by viewModel.proteinDistributionResult.collectAsStateWithLifecycle()
                        val frontLoadResult by viewModel.frontLoadingResult.collectAsStateWithLifecycle()
                        val calorieCyclingResult by viewModel.calorieCyclingResult.collectAsStateWithLifecycle()
                        val weekdayWeekendResult by viewModel.weekdayWeekendResult.collectAsStateWithLifecycle()
                        val mealRegularityResult by viewModel.mealRegularityResult.collectAsStateWithLifecycle()
                        val foodDiversityResult by viewModel.foodDiversityResult.collectAsStateWithLifecycle()

                        novaResult?.let {
                            NOVAScoreCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        omegaResult?.let {
                            OmegaRatioCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        diiResult?.let {
                            DIIScoreCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        tefResult?.let {
                            TEFCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        proteinDistResult?.let {
                            ProteinDistributionCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        frontLoadResult?.let {
                            CalorieFrontLoadingCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        calorieCyclingResult?.let {
                            CalorieCyclingCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        weekdayWeekendResult?.let {
                            WeekdayWeekendCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        mealRegularityResult?.let {
                            MealRegularityCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        foodDiversityResult?.let {
                            FoodDiversityCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                    }
                }

                2 -> {
                    if (weightLoading) {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    } else {
                        val tdeeResult by viewModel.tdeeResult.collectAsStateWithLifecycle()
                        val plateauResult by viewModel.plateauResult.collectAsStateWithLifecycle()
                        val weightForecastResult by viewModel.weightForecastResult.collectAsStateWithLifecycle()
                        val sodiumWeightResult by viewModel.sodiumWeightResult.collectAsStateWithLifecycle()
                        val caloricLagResult by viewModel.caloricLagResult.collectAsStateWithLifecycle()
                        val macroImpactResult by viewModel.macroImpactResult.collectAsStateWithLifecycle()
                        val mealTimingSummary by viewModel.mealTimingSummary.collectAsStateWithLifecycle()
                        val nutrientAdequacyResult by viewModel.nutrientAdequacyResult.collectAsStateWithLifecycle()

                        tdeeResult?.let {
                            AdaptiveTDEECard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        plateauResult?.let {
                            PlateauDetectionCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        weightForecastResult?.let {
                            WeightForecastCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        sodiumWeightResult?.let {
                            SodiumWeightCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        caloricLagResult?.let {
                            CaloricLagCard(it)
                            Spacer(Modifier.height(12.dp))
                        }
                        if (macroImpactResult.isNotEmpty()) {
                            MacroImpactCard(macroImpactResult)
                            Spacer(Modifier.height(12.dp))
                        }
                        MealTimingWeightCard(mealTimingSummary)
                        Spacer(Modifier.height(12.dp))
                        if (nutrientAdequacyResult.isNotEmpty()) {
                            NutrientAdequacyCard(nutrientAdequacyResult)
                        }
                    }
                }

                3 -> {
                    val sleepEntries by viewModel.sleepEntries.collectAsStateWithLifecycle()
                    val sleepFoodCorrelation by viewModel.sleepFoodCorrelation.collectAsStateWithLifecycle()
                    var showSleepDialog by remember { mutableStateOf(false) }
                    var sleepEntryToDelete by remember { mutableStateOf<SleepEntry?>(null) }

                    CollapsibleCard(title = stringResource(R.string.sleep_section_title), sectionId = "sleep") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                stringResource(R.string.sleep_recent),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                            IconButton(onClick = { showSleepDialog = true }) {
                                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.sleep_log_content_desc))
                            }
                        }

                        if (sleepEntries.isEmpty()) {
                            Text(
                                stringResource(R.string.sleep_no_entries),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            // Sleep quality trend chart
                            if (sleepEntries.size >= 3) {
                                Text(
                                    stringResource(R.string.sleep_quality_trend),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                SimpleLineChart(
                                    data = sleepEntries.sortedBy { it.entryDate }.map { it.quality.toFloat() },
                                    color = MaterialTheme.colorScheme.tertiary,
                                    modifier = Modifier.fillMaxWidth().height(80.dp),
                                    unit = "",
                                )
                                Spacer(modifier = Modifier.height(8.dp))

                                Text(
                                    stringResource(R.string.sleep_duration_trend),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                SimpleLineChart(
                                    data = sleepEntries.sortedBy { it.entryDate }.map { it.durationMinutes.toFloat() / 60f },
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.fillMaxWidth().height(80.dp),
                                    unit = "h",
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                            }

                            // Summary stats
                            val avgQuality = sleepEntries.map { it.quality }.average()
                            val avgDuration = sleepEntries.map { it.durationMinutes }.average()
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        avgQuality.formatDecimal1(),
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.tertiary,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        stringResource(R.string.sleep_avg_quality),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "${(avgDuration / 60.0).formatDecimal1()}h",
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        stringResource(R.string.sleep_avg_duration),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Recent entries list (last 5)
                            sleepEntries.sortedByDescending { it.entryDate }.take(5).forEach { entry ->
                                val qStr = entry.quality.formatNutrient()
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                        Icon(
                                            Icons.Default.Bedtime,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.tertiary,
                                            modifier = Modifier.size(16.dp),
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Column {
                                            Text(entry.entryDate, style = MaterialTheme.typography.bodySmall)
                                            Text(
                                                stringResource(
                                                    R.string.insights_sleep_entry_summary,
                                                    (entry.durationMinutes / 60.0).formatDecimal1(),
                                                    qStr,
                                                ),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    IconButton(
                                        onClick = { sleepEntryToDelete = entry },
                                    ) {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = stringResource(R.string.sleep_delete_content_desc),
                                            modifier = Modifier.size(16.dp),
                                        )
                                    }
                                }
                                HorizontalDivider()
                            }
                        }
                    }

                    // Sleep-Food Correlation
                    if (sleepFoodCorrelation.isNotEmpty() && sleepFoodCorrelation.size >= 3) {
                        Spacer(modifier = Modifier.height(12.dp))
                        CollapsibleCard(title = stringResource(R.string.sleep_evening_eating_title), sectionId = "sleepfood") {
                            Text(
                                stringResource(R.string.sleep_evening_eating_description),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            val withCalories = sleepFoodCorrelation.filter { it.eveningCalories != null }
                            if (withCalories.size >= 3) {
                                val avgCalories = withCalories.map { it.eveningCalories!! }.average()
                                val highCalDays = withCalories.filter { it.eveningCalories!! > avgCalories }
                                val lowCalDays = withCalories.filter { it.eveningCalories!! <= avgCalories }

                                val highCalAvgQuality = if (highCalDays.isNotEmpty()) highCalDays.map { it.sleepQuality }.average() else 0.0
                                val lowCalAvgQuality = if (lowCalDays.isNotEmpty()) lowCalDays.map { it.sleepQuality }.average() else 0.0

                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            lowCalAvgQuality.formatDecimal1(),
                                            style = MaterialTheme.typography.titleMedium,
                                            color = FiberGreen,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            stringResource(R.string.sleep_light_evening),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            stringResource(R.string.insights_below_avg_cal, avgCalories.formatAsInt()),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            highCalAvgQuality.formatDecimal1(),
                                            style = MaterialTheme.typography.titleMedium,
                                            color = CarbsOrange,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            stringResource(R.string.sleep_heavy_evening),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            stringResource(R.string.insights_above_avg_cal, avgCalories.formatAsInt()),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }

                                val delta = lowCalAvgQuality - highCalAvgQuality
                                if (kotlin.math.abs(delta) > 0.3) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    val lighterTemplate = stringResource(R.string.insights_lighter_evening_correlation)
                                    val heavierTemplate = stringResource(R.string.insights_heavier_evening_correlation)
                                    val message =
                                        if (delta > 0) {
                                            lighterTemplate.format(delta)
                                        } else {
                                            heavierTemplate.format(-delta)
                                        }
                                    Text(
                                        message,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            } else {
                                Text(
                                    stringResource(R.string.insights_need_more_evening_data),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Sleep analytics cards are now computed on-device from the local DB.
                    if (sleepLoading) {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    } else {
                        val foodSleepResult by viewModel.foodSleepResult.collectAsStateWithLifecycle()
                        val nutrientSleepCorrelations by viewModel.nutrientSleepCorrelations.collectAsStateWithLifecycle()
                        val preSleepTimingSummary by viewModel.preSleepTimingSummary.collectAsStateWithLifecycle()
                        val caffeineSleepResult by viewModel.caffeineSleepResult.collectAsStateWithLifecycle()

                        FoodSleepCard(foodSleepResult)
                        Spacer(Modifier.height(12.dp))
                        NutrientSleepCard(nutrientSleepCorrelations)
                        Spacer(Modifier.height(12.dp))
                        PreSleepWindowCard(preSleepTimingSummary)
                        Spacer(Modifier.height(12.dp))
                        CaffeineSleepCard(caffeineSleepResult)
                    }

                    if (showSleepDialog) {
                        SleepLogDialog(
                            onDismiss = { showSleepDialog = false },
                            onSave = { duration, quality, date, notes ->
                                viewModel.createSleepEntry(
                                    SleepCreate(
                                        durationMinutes = duration,
                                        quality = quality,
                                        entryDate = date,
                                        notes = notes.ifBlank { null },
                                    ),
                                )
                                showSleepDialog = false
                            },
                        )
                    }

                    sleepEntryToDelete?.let { entry ->
                        AlertDialog(
                            onDismissRequest = { sleepEntryToDelete = null },
                            title = { Text(stringResource(R.string.sleep_delete_dialog_title)) },
                            text = { Text(stringResource(R.string.sleep_delete_dialog_text, entry.entryDate)) },
                            confirmButton = {
                                TextButton(
                                    onClick = {
                                        viewModel.deleteSleepEntry(entry.id)
                                        sleepEntryToDelete = null
                                    },
                                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                ) { Text(stringResource(R.string.action_delete)) }
                            },
                            dismissButton = {
                                TextButton(onClick = { sleepEntryToDelete = null }) {
                                    Text(stringResource(R.string.dialog_cancel))
                                }
                            },
                        )
                    }
                }
            }

            if (isLocalMode) {
                Spacer(modifier = Modifier.height(20.dp))
                Text(
                    stringResource(R.string.insights_more_with_account),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
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
            Text("${weekly.formatAsInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("${monthly.formatAsInt()} $unit", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(
                "$trendArrow ${abs(diffPercent).formatAsInt()}%",
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
                stringResource(R.string.insights_avg_value_unit, avg.formatAsInt(), unit),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        SimpleLineChart(
            data = data,
            color = color,
            modifier = Modifier.fillMaxWidth().height(60.dp),
            unit = unit,
        )
    }
}

@Composable
private fun MealBreakdownLegend(
    entries: List<MealBreakdownEntry>,
    totalCalories: Double,
) {
    entries.forEachIndexed { index, entry ->
        val pct = (entry.calories / totalCalories * 100).formatAsInt()
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
                mealTypeDisplayName(entry.mealType),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.insights_meal_pct_format, entry.calories.formatAsInt(), pct),
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
                stringResource(R.string.macro_calories),
                strictDays = dailyStats.count { it.calories <= goals.calorieGoal },
                tolerantDays =
                    dailyStats.count {
                        it.calories <= goals.calorieGoal * 1.1 && it.calories >= goals.calorieGoal * 0.9
                    },
                CaloriesBlue,
            ),
            GoalStat(
                stringResource(R.string.macro_protein),
                strictDays = dailyStats.count { it.protein >= goals.proteinGoal },
                tolerantDays = dailyStats.count { it.protein >= goals.proteinGoal * 0.9 },
                ProteinRed,
            ),
            GoalStat(
                stringResource(R.string.macro_carbs),
                strictDays = dailyStats.count { it.carbs <= goals.carbGoal },
                tolerantDays = dailyStats.count { it.carbs <= goals.carbGoal * 1.1 },
                CarbsOrange,
            ),
            GoalStat(
                stringResource(R.string.macro_fat),
                strictDays = dailyStats.count { it.fat <= goals.fatGoal },
                tolerantDays = dailyStats.count { it.fat <= goals.fatGoal * 1.1 },
                FatYellow,
            ),
            GoalStat(
                stringResource(R.string.macro_fiber),
                strictDays = dailyStats.count { it.fiber >= goals.fiberGoal },
                tolerantDays = dailyStats.count { it.fiber >= goals.fiberGoal * 0.9 },
                FiberGreen,
            ),
        )

    CollapsibleCard(title = stringResource(R.string.insights_goal_adherence), sectionId = "goals") {
        Text(
            stringResource(R.string.insights_days_within_goal_range, totalDays),
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
                        stringResource(R.string.insights_goal_pct, (tolerantPct * 100).formatAsInt()),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(36.dp),
                        textAlign = TextAlign.End,
                    )
                    Text(
                        stringResource(R.string.insights_goal_pct_strict, (strictPct * 100).formatAsInt()),
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SleepLogDialog(
    onDismiss: () -> Unit,
    onSave: (duration: Int, quality: Double, date: String, notes: String) -> Unit,
) {
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var durationHours by remember { mutableStateOf("8") }
    var durationMinutes by remember { mutableStateOf("0") }
    var quality by remember { mutableFloatStateOf(7f) }
    var date by remember { mutableStateOf(today.toString()) }
    var notes by remember { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }

    val totalMinutes = (durationHours.toIntOrNull() ?: 0) * 60 + (durationMinutes.toIntOrNull() ?: 0)
    val durationError = totalMinutes == 0

    val todayEpochMillis = today.toEpochDays().toLong() * 24L * 60L * 60L * 1000L
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = todayEpochMillis)

    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            date =
                                Instant
                                    .fromEpochMilliseconds(millis)
                                    .toLocalDateTime(TimeZone.UTC)
                                    .date
                                    .toString()
                        }
                        showDatePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.sleep_log_dialog_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = date,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.insights_sleep_date_label)) },
                    trailingIcon = {
                        IconButton(onClick = { showDatePicker = true }) {
                            Icon(Icons.Default.CalendarToday, contentDescription = stringResource(R.string.insights_sleep_pick_date))
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Text(stringResource(R.string.insights_sleep_duration_label), style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = durationHours,
                        onValueChange = { durationHours = it.filter { c -> c.isDigit() } },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        suffix = { Text(stringResource(R.string.insights_hours_unit)) },
                        isError = durationError,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = durationMinutes,
                        onValueChange = { durationMinutes = it.filter { c -> c.isDigit() } },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        suffix = { Text(stringResource(R.string.insights_minutes_unit)) },
                        isError = durationError,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                if (durationError) {
                    Text(
                        stringResource(R.string.insights_sleep_duration_error),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Text(
                    stringResource(R.string.insights_sleep_quality_label, quality.formatAsInt()),
                    style = MaterialTheme.typography.labelMedium,
                )
                Slider(
                    value = quality,
                    onValueChange = { quality = it },
                    valueRange = 1f..10f,
                    steps = 8,
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(stringResource(R.string.weight_notes_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (!durationError) {
                        onSave(totalMinutes, quality.roundToInt().toDouble(), date, notes)
                    }
                },
                enabled = !durationError,
            ) {
                Text(stringResource(R.string.weight_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}
