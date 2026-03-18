package com.bissbilanz.android.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EntryEditSheet
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.util.mealTypes
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedName
import com.bissbilanz.util.resolvedProtein
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayLogScreen(
    date: String,
    navController: NavController,
) {
    val viewModel: DayLogViewModel = koinViewModel()
    val entryRepo: EntryRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val isFastingDay by viewModel.isFastingDay.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    var entryToDelete by remember { mutableStateOf<Entry?>(null) }
    var editingEntryId by remember { mutableStateOf<String?>(null) }
    var showQuickAddSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(date) {
        viewModel.loadEntries(date)
    }

    LaunchedEffect(error) {
        error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    val mealGroups = entries.groupBy { it.mealType }
    val sortedMeals =
        mealTypes.filter { mealGroups.containsKey(it) } +
            mealGroups.keys.filter { it !in mealTypes }

    if (entryToDelete != null) {
        val entry = entryToDelete!!
        val name = entry.resolvedName()
        AlertDialog(
            onDismissRequest = { entryToDelete = null },
            title = { Text("Delete Entry") },
            text = { Text("Remove \"$name\" from your log?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteEntry(entry.id)
                        entryToDelete = null
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { entryToDelete = null }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(date) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            try {
                                val parsedDate = LocalDate.parse(date)
                                val yesterday = parsedDate.minus(1, DateTimeUnit.DAY).toString()
                                val count = entryRepo.copyEntries(yesterday, date)
                                snackbarHostState.showSnackbar("Copied $count entries")
                                viewModel.loadEntries(date, force = true)
                            } catch (_: Exception) {
                                snackbarHostState.showSnackbar("No entries to copy")
                            }
                        }
                    }) {
                        Icon(Icons.Default.ContentCopy, "Copy from yesterday")
                    }
                    IconButton(onClick = { showQuickAddSheet = true }) {
                        Icon(Icons.Default.Edit, "Quick add")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate("foods") }) {
                Icon(Icons.Default.Add, "Add entry")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (editingEntryId != null) {
            EntryEditSheet(
                entryId = editingEntryId,
                date = null,
                onDismiss = { editingEntryId = null },
                onSaved = {
                    editingEntryId = null
                    viewModel.loadEntries(date, force = true)
                },
            )
        }

        if (showQuickAddSheet) {
            EntryEditSheet(
                entryId = null,
                date = date,
                onDismiss = { showQuickAddSheet = false },
                onSaved = {
                    showQuickAddSheet = false
                    viewModel.loadEntries(date, force = true)
                },
            )
        }

        if (isLoading) {
            LoadingScreen()
        } else {
            val totalCalories = entries.sumOf { it.resolvedCalories() }

            PullToRefreshWrapper(
                onRefresh = { refreshManager.refreshAll(date) },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(bottom = 80.dp),
                ) {
                    if (totalCalories == 0.0) {
                        item {
                            Spacer(modifier = Modifier.height(12.dp))
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors =
                                    CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    ),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            stringResource(R.string.fasting_day),
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        Text(
                                            stringResource(R.string.fasting_day_description),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Switch(
                                        checked = isFastingDay,
                                        onCheckedChange = { viewModel.toggleFastingDay(date) },
                                    )
                                }
                            }
                        }
                    }

                    if (entries.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "No entries for this day",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    } else {
                        sortedMeals.forEach { meal ->
                            val mealEntries = mealGroups[meal] ?: return@forEach

                            val mealCalories = mealEntries.sumOf { it.resolvedCalories() }
                            val mealProtein = mealEntries.sumOf { it.resolvedProtein() }
                            val mealCarbs = mealEntries.sumOf { it.resolvedCarbs() }
                            val mealFat = mealEntries.sumOf { it.resolvedFat() }

                            item {
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        meal.replaceFirstChar { it.uppercase() },
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        "${mealCalories.toInt()} cal",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = CaloriesBlue,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    modifier = Modifier.padding(bottom = 4.dp),
                                ) {
                                    Text("P ${mealProtein.toInt()}g", style = MaterialTheme.typography.labelSmall, color = ProteinRed)
                                    Text("C ${mealCarbs.toInt()}g", style = MaterialTheme.typography.labelSmall, color = CarbsOrange)
                                    Text("F ${mealFat.toInt()}g", style = MaterialTheme.typography.labelSmall, color = FatYellow)
                                }
                            }
                            items(mealEntries, key = { it.id }) { entry ->
                                Box(modifier = Modifier.animateItem()) {
                                    SwipeToDismissEntry(
                                        entry = entry,
                                        onDelete = { entryToDelete = entry },
                                        onClick = {
                                            editingEntryId = entry.id
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeToDismissEntry(
    entry: Entry,
    onDelete: () -> Unit,
    onClick: () -> Unit,
) {
    val dismissState =
        rememberSwipeToDismissBoxState(
            confirmValueChange = { value ->
                if (value == SwipeToDismissBoxValue.EndToStart) {
                    onDelete()
                    false
                } else {
                    false
                }
            },
        )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color by animateColorAsState(
                if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) {
                    MaterialTheme.colorScheme.errorContainer
                } else {
                    MaterialTheme.colorScheme.surface
                },
                label = "bg",
            )
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(color)
                        .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
            }
        },
        enableDismissFromStartToEnd = false,
    ) {
        EntryListItem(entry, onClick)
    }
}

@Composable
fun EntryListItem(
    entry: Entry,
    onClick: () -> Unit,
) {
    val name = entry.resolvedName()
    val calories = entry.resolvedCalories()
    val protein = entry.resolvedProtein()

    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
    ) {
        ListItem(
            headlineContent = { Text(name) },
            supportingContent = {
                Text("${entry.servings}x  ·  ${calories.toInt()} cal  ·  P ${protein.toInt()}g")
            },
            trailingContent = {
                entry.food?.brand?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
    }
}
