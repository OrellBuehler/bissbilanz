package com.bissbilanz.android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.model.Supplement
import com.bissbilanz.model.SupplementHistoryEntry
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.util.SupplementSchedule
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.compose.koinInject

private data class IngredientRow(
    val name: String,
    val detail: String,
)

private data class DayItem(
    val name: String,
    val summary: String,
    val ingredients: List<IngredientRow>,
)

private data class DayAdherence(
    val date: String,
    val taken: List<DayItem>,
    val missed: List<DayItem>,
)

private fun computeAdherence(
    history: List<SupplementHistoryEntry>,
    allSupplements: List<Supplement>,
    from: LocalDate,
    to: LocalDate,
    ingredientCountTemplate: String,
): List<DayAdherence> {
    val active = allSupplements.filter { it.isActive }
    if (active.isEmpty()) return emptyList()

    val logsByDate = mutableMapOf<String, MutableSet<String>>()
    for (entry in history) {
        logsByDate.getOrPut(entry.date) { mutableSetOf() }.add(entry.supplementId)
    }

    val days = mutableListOf<DayAdherence>()
    var current = to
    while (current >= from) {
        val dateStr = current.toString()
        val due =
            active.filter { s ->
                SupplementSchedule.isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, current)
            }
        if (due.isNotEmpty()) {
            val takenIds = logsByDate[dateStr] ?: emptySet()

            fun Supplement.toItem(): DayItem {
                val ings = ingredients
                val summary =
                    when {
                        ings.isEmpty() -> ""
                        ings.size == 1 -> ings[0].food.ingredientsText.orEmpty()
                        else -> String.format(ingredientCountTemplate, ings.size)
                    }
                return DayItem(
                    name = name,
                    summary = summary,
                    ingredients =
                        ings.map { ing ->
                            IngredientRow(
                                name = ing.food.name,
                                detail = ing.food.ingredientsText.orEmpty(),
                            )
                        },
                )
            }
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

    val loadFailedMessage = stringResource(R.string.supplement_history_load_failed)
    val ingredientCountTemplate = stringResource(R.string.supplements_ingredient_count)

    val fetchData: suspend () -> Unit = {
        try {
            val history = supplementRepo.getHistory(fromDate.toString(), toDate.toString())
            val allSupplements = supplementRepo.getAllSupplements()
            adherence = computeAdherence(history, allSupplements, fromDate, toDate, ingredientCountTemplate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar(loadFailedMessage)
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
                }) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showFromPicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
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
                }) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showToPicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = state) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.supplement_history_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
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
                                    Text(stringResource(R.string.supplement_history_from), style = MaterialTheme.typography.labelMedium)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedButton(
                                        onClick = { showFromPicker = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(
                                            Icons.Default.CalendarMonth,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(dayLabel(fromDate), style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(stringResource(R.string.supplement_history_to), style = MaterialTheme.typography.labelMedium)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedButton(
                                        onClick = { showToPicker = true },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(
                                            Icons.Default.CalendarMonth,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(dayLabel(toDate), style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { scope.launch { loadData() } },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(stringResource(R.string.supplement_history_filter))
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
                        EmptyState(stringResource(R.string.supplement_history_empty))
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
                    stringResource(R.string.supplements_taken_count, day.taken.size, total),
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
    val hasIngredients = item.ingredients.size > 1
    val isExpanded = expandedItems.contains(itemKey)
    val dosageText = item.summary

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
                contentDescription = stringResource(if (taken) R.string.supplement_history_taken else R.string.supplement_history_missed),
                tint = if (taken) FiberGreen else ProteinRed,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            if (hasIngredients) {
                Icon(
                    imageVector =
                        if (isExpanded) {
                            Icons.Default.KeyboardArrowDown
                        } else {
                            Icons.AutoMirrored.Filled.KeyboardArrowRight
                        },
                    contentDescription = stringResource(R.string.supplement_history_toggle_ingredients),
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
                    val label =
                        if (ing.detail.isBlank()) ing.name else "${ing.name} — ${ing.detail}"
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
