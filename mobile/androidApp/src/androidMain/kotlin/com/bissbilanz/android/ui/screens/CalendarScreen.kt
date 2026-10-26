package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.util.displayName
import com.bissbilanz.android.util.formatMonthYear
import com.bissbilanz.model.CalendarDay
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.StatsRepository
import kotlinx.datetime.*
import org.koin.compose.koinInject
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.time.Clock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(navController: NavController) {
    val statsRepo: StatsRepository = koinInject()
    val goalsRepo: GoalsRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var isLoading by remember { mutableStateOf(true) }
    var hasLoaded by remember { mutableStateOf(false) }
    var calendarDays by remember { mutableStateOf<List<CalendarDay>>(emptyList()) }
    var goals by remember { mutableStateOf<Goals?>(null) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    // Months since year 0, so the shown month survives rotation and steps across years.
    var monthIndex by rememberSaveable { mutableIntStateOf(today.year * 12 + today.month.number - 1) }
    val currentYear = monthIndex / 12
    val currentMonth = Month(monthIndex % 12 + 1)

    // Results are applied only while their month is still the one shown, so a slow
    // response for a month the user already left can't overwrite the newer one.
    suspend fun fetchMonth(index: Int) {
        val monthStr = "%04d-%02d".format(index / 12, index % 12 + 1)
        val days =
            try {
                statsRepo.getCalendarStats(monthStr).also { goals = goalsRepo.goalsOnce() }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }
        if (index == monthIndex) calendarDays = days
    }

    LaunchedEffect(monthIndex) {
        isLoading = true
        fetchMonth(monthIndex)
        isLoading = false
        hasLoaded = true
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            AppTopBar(
                scrollBehavior = scrollBehavior,
                title = stringResource(R.string.calendar_title),
                onBack = { navController.popBackStack() },
            )
        },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                fetchMonth(monthIndex)
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
            ) {
                // Month navigation
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { monthIndex-- }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.calendar_previous_month))
                    }
                    Text(
                        formatMonthYear(currentYear, currentMonth),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    IconButton(onClick = { monthIndex++ }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.calendar_next_month))
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (isLoading && !hasLoaded) {
                    LoadingScreen()
                } else {
                    Box(modifier = Modifier.fillMaxWidth().height(4.dp)) {
                        if (isLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    Spacer(modifier = Modifier.height(8.dp))

                    // Day of week headers
                    Row(modifier = Modifier.fillMaxWidth()) {
                        DayOfWeek.entries.map { it.displayName() }.forEach { day ->
                            Text(
                                day,
                                modifier = Modifier.weight(1f),
                                textAlign = TextAlign.Center,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Calendar grid
                    val weeks = remember(monthIndex) { monthWeeks(currentYear, currentMonth) }
                    val monthPrefix = remember(monthIndex) { "%04d-%02d".format(currentYear, currentMonth.number) }
                    // Days of the month being fetched are still the previous month's until it lands.
                    val monthDays = remember(calendarDays, monthPrefix) { calendarDays.filter { it.date.startsWith(monthPrefix) } }
                    val dayMap = remember(monthDays) { monthDays.associateBy { it.date } }
                    val todayStr = remember(today) { today.toString() }

                    weeks.forEach { week ->
                        Row(modifier = Modifier.fillMaxWidth()) {
                            week.forEach { day ->
                                Box(
                                    modifier =
                                        Modifier
                                            .weight(1f)
                                            .aspectRatio(1f)
                                            .padding(2.dp)
                                            .let { mod ->
                                                if (day != null) {
                                                    mod.clickable { navController.navigate("daylog/${day.dateStr}") }
                                                } else {
                                                    mod
                                                }
                                            },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (day != null) {
                                        val calDay = dayMap[day.dateStr]
                                        val isToday = day.dateStr == todayStr

                                        val bgColor =
                                            when {
                                                calDay == null || !calDay.hasEntries -> {
                                                    MaterialTheme.colorScheme.surface
                                                }

                                                isOnTarget(calDay.calories, goals?.calorieGoal) -> {
                                                    FiberGreen.copy(alpha = 0.3f)
                                                }

                                                isOverTarget(calDay.calories, goals?.calorieGoal) -> {
                                                    ProteinRed.copy(alpha = 0.3f)
                                                }

                                                else -> {
                                                    CaloriesBlue.copy(alpha = 0.2f)
                                                }
                                            }

                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            modifier =
                                                Modifier
                                                    .fillMaxSize()
                                                    .clip(CircleShape)
                                                    .background(bgColor)
                                                    .let { mod ->
                                                        if (isToday) {
                                                            mod.background(
                                                                MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                                                                CircleShape,
                                                            )
                                                        } else {
                                                            mod
                                                        }
                                                    },
                                            verticalArrangement = Arrangement.Center,
                                        ) {
                                            Text(
                                                day.day.toString(),
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                                                color =
                                                    if (isToday) {
                                                        MaterialTheme.colorScheme.primary
                                                    } else {
                                                        MaterialTheme.colorScheme.onSurface
                                                    },
                                            )
                                            if (calDay?.hasEntries == true) {
                                                Text(
                                                    "${calDay.calories.roundToInt()}",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Legend
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.calendar_legend),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier =
                                        Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(FiberGreen.copy(alpha = 0.3f)),
                                )
                                Text(stringResource(R.string.calendar_goal_met))
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier =
                                        Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(ProteinRed.copy(alpha = 0.3f)),
                                )
                                Text(stringResource(R.string.calendar_heatmap_over))
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier =
                                        Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(CaloriesBlue.copy(alpha = 0.2f)),
                                )
                                Text(stringResource(R.string.calendar_has_entries))
                            }

                            // Summary stats
                            val daysWithEntries = monthDays.count { it.hasEntries }
                            val goalCal = goals?.calorieGoal
                            val daysGoalMet = monthDays.count { it.hasEntries && isOnTarget(it.calories, goalCal) }
                            val avgCalories =
                                if (daysWithEntries > 0) {
                                    monthDays.filter { it.hasEntries }.map { it.calories }.average()
                                } else {
                                    0.0
                                }

                            Spacer(modifier = Modifier.height(12.dp))
                            HorizontalDivider()
                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "$daysWithEntries",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = CaloriesBlue.macroTextTone(),
                                    )
                                    Text(stringResource(R.string.calendar_days_logged), style = MaterialTheme.typography.labelSmall)
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "$daysGoalMet",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = FiberGreen.macroTextTone(),
                                    )
                                    Text(stringResource(R.string.calendar_goals_met), style = MaterialTheme.typography.labelSmall)
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "${avgCalories.roundToInt()}",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(stringResource(R.string.calendar_avg_cal), style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class CalendarCell(
    val day: Int,
    val dateStr: String,
)

private fun monthWeeks(
    year: Int,
    month: Month,
): List<List<CalendarCell?>> {
    val daysInMonth =
        when (month) {
            Month.FEBRUARY -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
            Month.APRIL, Month.JUNE, Month.SEPTEMBER, Month.NOVEMBER -> 30
            else -> 31
        }
    // ISO: Monday=1
    val leadingBlanks = LocalDate(year, month, 1).dayOfWeek.isoDayNumber - 1
    val cells =
        List<CalendarCell?>(leadingBlanks) { null } +
            (1..daysInMonth).map { CalendarCell(it, "%04d-%02d-%02d".format(year, month.number, it)) }
    return cells.chunked(7).map { week -> week + List(7 - week.size) { null } }
}

/** Within 10 % of the goal either way — the band the Insights heatmap shows as on target. */
private fun isOnTarget(
    calories: Double,
    goal: Double?,
): Boolean = goal != null && goal > 0 && abs(1.0 - calories / goal) <= ON_TARGET_TOLERANCE

private fun isOverTarget(
    calories: Double,
    goal: Double?,
): Boolean = goal != null && goal > 0 && calories / goal > 1.0 + ON_TARGET_TOLERANCE

private const val ON_TARGET_TOLERANCE = 0.10
