package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.model.CalendarDay
import com.bissbilanz.repository.StatsRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(navController: NavController) {
    val statsRepo: StatsRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }
    var calendarDays by remember { mutableStateOf<List<CalendarDay>>(emptyList()) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var currentMonth by remember { mutableStateOf(today.month) }
    var currentYear by remember { mutableStateOf(today.year) }

    suspend fun fetchMonth() {
        val monthStr = "%04d-%02d".format(currentYear, currentMonth.value)
        try {
            calendarDays = statsRepo.getCalendarStats(monthStr)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            calendarDays = emptyList()
        }
    }

    fun loadMonth() {
        scope.launch {
            isLoading = true
            fetchMonth()
            isLoading = false
        }
    }

    LaunchedEffect(currentYear, currentMonth) {
        loadMonth()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("History") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                fetchMonth()
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
                    IconButton(onClick = {
                        if (currentMonth == Month.JANUARY) {
                            currentMonth = Month.DECEMBER
                            currentYear--
                        } else {
                            currentMonth = Month(currentMonth.value - 1)
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous month")
                    }
                    Text(
                        "${currentMonth.name.lowercase().replaceFirstChar { it.uppercase() }} $currentYear",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    IconButton(onClick = {
                        if (currentMonth == Month.DECEMBER) {
                            currentMonth = Month.JANUARY
                            currentYear++
                        } else {
                            currentMonth = Month(currentMonth.value + 1)
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next month")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (isLoading) {
                    LoadingScreen()
                } else {
                    // Day of week headers
                    Row(modifier = Modifier.fillMaxWidth()) {
                        listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").forEach { day ->
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
                    val firstDayOfMonth = LocalDate(currentYear, currentMonth, 1)
                    val daysInMonth =
                        when (currentMonth) {
                            Month.FEBRUARY -> if (currentYear % 4 == 0 && (currentYear % 100 != 0 || currentYear % 400 == 0)) 29 else 28
                            Month.APRIL, Month.JUNE, Month.SEPTEMBER, Month.NOVEMBER -> 30
                            else -> 31
                        }
                    // ISO: Monday=1
                    val startDayOfWeek = firstDayOfMonth.dayOfWeek.isoDayNumber

                    val dayMap = calendarDays.associateBy { it.date }

                    var dayCounter = 1
                    val weeks = mutableListOf<List<Int?>>()
                    var currentWeek = mutableListOf<Int?>()

                    // Fill empty days before first day
                    for (i in 1 until startDayOfWeek) {
                        currentWeek.add(null)
                    }

                    while (dayCounter <= daysInMonth) {
                        currentWeek.add(dayCounter)
                        if (currentWeek.size == 7) {
                            weeks.add(currentWeek.toList())
                            currentWeek = mutableListOf()
                        }
                        dayCounter++
                    }
                    // Fill remaining days in last week
                    while (currentWeek.size < 7 && currentWeek.isNotEmpty()) {
                        currentWeek.add(null)
                    }
                    if (currentWeek.isNotEmpty()) {
                        weeks.add(currentWeek.toList())
                    }

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
                                                    val dateStr = "%04d-%02d-%02d".format(currentYear, currentMonth.value, day)
                                                    mod.clickable { navController.navigate("daylog/$dateStr") }
                                                } else {
                                                    mod
                                                }
                                            },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (day != null) {
                                        val dateStr = "%04d-%02d-%02d".format(currentYear, currentMonth.value, day)
                                        val calDay = dayMap[dateStr]
                                        val isToday = dateStr == today.toString()

                                        val bgColor =
                                            when {
                                                calDay?.goalMet == true -> FiberGreen.copy(alpha = 0.3f)
                                                calDay?.hasEntries == true -> CaloriesBlue.copy(alpha = 0.2f)
                                                else -> MaterialTheme.colorScheme.surface
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
                                                day.toString(),
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
                                                    "${calDay.calories.toInt()}",
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
                                "Legend",
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
                                Text("Goal met")
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
                                Text("Has entries")
                            }

                            // Summary stats
                            val daysWithEntries = calendarDays.count { it.hasEntries }
                            val daysGoalMet = calendarDays.count { it.goalMet }
                            val avgCalories =
                                if (daysWithEntries > 0) {
                                    calendarDays.filter { it.hasEntries }.map { it.calories }.average()
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
                                        color = CaloriesBlue,
                                    )
                                    Text("Days logged", style = MaterialTheme.typography.labelSmall)
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "$daysGoalMet",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = FiberGreen,
                                    )
                                    Text("Goals met", style = MaterialTheme.typography.labelSmall)
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "${avgCalories.toInt()}",
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text("Avg cal", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
