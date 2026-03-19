package com.bissbilanz.android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.model.ScheduleType
import com.bissbilanz.model.Supplement
import com.bissbilanz.model.SupplementHistoryEntry
import com.bissbilanz.model.SupplementIngredient
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.compose.koinInject
import kotlin.math.roundToInt

private data class DayItem(
    val name: String,
    val dosage: Double,
    val dosageUnit: String,
    val ingredients: List<SupplementIngredient>,
)

private data class DayAdherence(
    val date: String,
    val taken: List<DayItem>,
    val missed: List<DayItem>,
)

private fun isSupplementDue(
    scheduleType: ScheduleType,
    scheduleDays: List<Int>?,
    scheduleStartDate: String?,
    date: LocalDate,
): Boolean =
    when (scheduleType) {
        ScheduleType.daily -> true
        ScheduleType.every_other_day -> {
            if (scheduleStartDate == null) {
                true
            } else {
                val start = LocalDate.parse(scheduleStartDate)
                val daysBetween = start.daysUntil(date)
                daysBetween % 2 == 0
            }
        }
        ScheduleType.weekly, ScheduleType.specific_days -> {
            if (scheduleDays.isNullOrEmpty()) {
                false
            } else {
                val dow = date.dayOfWeek.value % 7
                scheduleDays.contains(dow)
            }
        }
    }

private fun computeAdherence(
    history: List<SupplementHistoryEntry>,
    allSupplements: List<Supplement>,
    from: LocalDate,
    to: LocalDate,
): List<DayAdherence> {
    val active = allSupplements.filter { it.isActive }
    if (active.isEmpty()) return emptyList()

    val logsByDate = mutableMapOf<String, MutableSet<String>>()
    for (entry in history) {
        logsByDate.getOrPut(entry.log.date) { mutableSetOf() }.add(entry.log.supplementId)
    }

    val days = mutableListOf<DayAdherence>()
    var current = to
    while (current >= from) {
        val dateStr = current.toString()
        val due =
            active.filter { s ->
                isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, current)
            }
        if (due.isNotEmpty()) {
            val takenIds = logsByDate[dateStr] ?: emptySet()

            fun Supplement.toItem() = DayItem(name, dosage, dosageUnit, ingredients ?: emptyList())
            days.add(
                DayAdherence(
                    date = dateStr,
                    taken = due.filter { takenIds.contains(it.id) }.map { it.toItem() },
                    missed = due.filter { !takenIds.contains(it.id) }.map { it.toItem() },
                ),
            )
        }
        current = current.minus(DatePeriod(days = 1))
    }
    return days
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementHistoryScreen(navController: NavController) {
    val supplementRepo: SupplementRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(true) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    var fromDate by remember { mutableStateOf(today.minus(DatePeriod(days = 30))) }
    var toDate by remember { mutableStateOf(today) }
    var adherence by remember { mutableStateOf<List<DayAdherence>>(emptyList()) }
    var expandedItems by remember { mutableStateOf(setOf<String>()) }

    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }

    val fetchData: suspend () -> Unit = {
        try {
            val history = supplementRepo.getHistory(fromDate.toString(), toDate.toString())
            val allSupplements = supplementRepo.getAllSupplements()
            adherence = computeAdherence(history, allSupplements, fromDate, toDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar("Failed to load history")
        }
    }

    val loadData: suspend () -> Unit = {
        isLoading = true
        fetchData()
        isLoading = false
    }

    LaunchedEffect(Unit) { loadData() }

    if (showFromPicker) {
        val state =
            rememberDatePickerState(
                initialSelectedDateMillis = fromDate.atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds(),
            )
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        fromDate =
                            Instant
                                .fromEpochMilliseconds(it)
                                .toLocalDateTime(TimeZone.UTC)
                                .date
                    }
                    showFromPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showFromPicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = state) }
    }

    if (showToPicker) {
        val state =
            rememberDatePickerState(
                initialSelectedDateMillis = toDate.atStartOfDayIn(TimeZone.UTC).toEpochMilliseconds(),
            )
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        toDate =
                            Instant
                                .fromEpochMilliseconds(it)
                                .toLocalDateTime(TimeZone.UTC)
                                .date
                    }
                    showToPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showToPicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = state) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Supplement History") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                fetchData()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("From", style = MaterialTheme.typography.labelMedium)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedCard(
                                        onClick = { showFromPicker = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            fromDate.toString(),
                                            modifier = Modifier.padding(12.dp),
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("To", style = MaterialTheme.typography.labelMedium)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedCard(
                                        onClick = { showToPicker = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            toDate.toString(),
                                            modifier = Modifier.padding(12.dp),
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { scope.launch { loadData() } },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Filter")
                            }
                        }
                    }
                }

                if (isLoading) {
                    item {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                } else if (adherence.isEmpty()) {
                    item {
                        EmptyState("No supplement data for this period.")
                    }
                } else {
                    items(adherence, key = { it.date }) { day ->
                        DayAdherenceCard(
                            day = day,
                            expandedItems = expandedItems,
                            onToggleExpand = { key ->
                                expandedItems =
                                    if (expandedItems.contains(key)) {
                                        expandedItems - key
                                    } else {
                                        expandedItems + key
                                    }
                            },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayAdherenceCard(
    day: DayAdherence,
    expandedItems: Set<String>,
    onToggleExpand: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val total = day.taken.size + day.missed.size
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    day.date,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "${day.taken.size} / $total taken",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))

            day.taken.forEach { item ->
                HistorySupplementRow(
                    item = item,
                    taken = true,
                    itemKey = "${day.date}-taken-${item.name}",
                    expandedItems = expandedItems,
                    onToggleExpand = onToggleExpand,
                )
            }
            day.missed.forEach { item ->
                HistorySupplementRow(
                    item = item,
                    taken = false,
                    itemKey = "${day.date}-missed-${item.name}",
                    expandedItems = expandedItems,
                    onToggleExpand = onToggleExpand,
                )
            }
        }
    }
}

@Composable
private fun HistorySupplementRow(
    item: DayItem,
    taken: Boolean,
    itemKey: String,
    expandedItems: Set<String>,
    onToggleExpand: (String) -> Unit,
) {
    val hasIngredients = item.ingredients.isNotEmpty()
    val isExpanded = expandedItems.contains(itemKey)
    val dosageText =
        if (item.dosage == item.dosage.roundToInt().toDouble()) {
            "${item.dosage.roundToInt()} ${item.dosageUnit}"
        } else {
            "${item.dosage} ${item.dosageUnit}"
        }

    Column {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .then(
                        if (hasIngredients) {
                            Modifier.clickable { onToggleExpand(itemKey) }
                        } else {
                            Modifier
                        },
                    ).padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (taken) Icons.Default.Check else Icons.Default.Close,
                contentDescription = if (taken) "Taken" else "Missed",
                tint = if (taken) FiberGreen else Color(0xFFEF4444),
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            if (hasIngredients) {
                Icon(
                    imageVector =
                        if (isExpanded) {
                            Icons.Default.KeyboardArrowDown
                        } else {
                            Icons.Default.KeyboardArrowRight
                        },
                    contentDescription = "Toggle ingredients",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(
                item.name,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color =
                    if (taken) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                dosageText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        AnimatedVisibility(visible = hasIngredients && isExpanded) {
            Column(modifier = Modifier.padding(start = 46.dp)) {
                item.ingredients.forEach { ing ->
                    val ingDosage =
                        if (ing.dosage == ing.dosage.roundToInt().toDouble()) {
                            "${ing.dosage.roundToInt()} ${ing.dosageUnit}"
                        } else {
                            "${ing.dosage} ${ing.dosageUnit}"
                        }
                    Text(
                        "${ing.name} — $ingDosage",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
