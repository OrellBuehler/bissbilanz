package com.bissbilanz.android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.SupplementEditSheet
import com.bissbilanz.android.ui.components.timeOfDayDisplayName
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.GentleSpring
import com.bissbilanz.android.ui.theme.Motion
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.model.Supplement
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

// Single-ingredient supplements show the backing food's dosage label
// (e.g. "1000 IU"); multi-ingredient show an ingredient count summary.
@Composable
private fun dosageSummary(supplement: Supplement): String {
    val ings = supplement.ingredients
    return when {
        ings.isEmpty() -> ""
        ings.size == 1 -> ings[0].food.ingredientsText ?: ""
        else -> stringResource(R.string.supplements_ingredient_count, ings.size)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementsScreen(navController: NavController) {
    val supplementRepo: SupplementRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val supplements by supplementRepo.supplements().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = rememberHaptic()
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
    var takenIds by remember { mutableStateOf(setOf<String>()) }
    var showCreateSheet by remember { mutableStateOf(false) }
    var editingSupplementId by remember { mutableStateOf<String?>(null) }
    val loadFailedMessage = stringResource(R.string.supplements_load_failed)
    val updateFailedMessage = stringResource(R.string.supplements_update_failed)

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            supplementRepo.refresh()
            takenIds = supplementRepo.getChecklist(today).map { it.supplementId }.toSet()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            snackbarHostState.showSnackbar(loadFailedMessage)
        }
        isLoading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.chart_supplements)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
                actions = {
                    IconButton(onClick = { navController.navigate("supplement-history") }) {
                        Icon(Icons.Default.DateRange, stringResource(R.string.calendar_title))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                haptic(HapticFeedbackType.LongPress)
                showCreateSheet = true
            }) {
                Icon(Icons.Default.Add, stringResource(R.string.supplements_add))
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (showCreateSheet) {
            SupplementEditSheet(
                supplementId = null,
                onDismiss = { showCreateSheet = false },
                onSaved = {
                    showCreateSheet = false
                    scope.launch { supplementRepo.refresh() }
                },
            )
        }

        if (editingSupplementId != null) {
            SupplementEditSheet(
                supplementId = editingSupplementId,
                onDismiss = { editingSupplementId = null },
                onSaved = {
                    editingSupplementId = null
                    scope.launch { supplementRepo.refresh() }
                },
            )
        }

        PullToRefreshWrapper(
            onRefresh = {
                refreshManager.refreshAll()
                try {
                    takenIds = supplementRepo.getChecklist(today).map { it.supplementId }.toSet()
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    errorReporter.captureException(e)
                }
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading, label = "supplements") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (supplements.isEmpty()) {
                    EmptyState(stringResource(R.string.supplements_empty))
                } else {
                    val activeSupplements = supplements.filter { it.isActive }

                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp),
                    ) {
                        item {
                            Text(
                                stringResource(R.string.supplements_today_checklist),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                stringResource(R.string.supplements_taken_count, takenIds.size, activeSupplements.size),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            if (activeSupplements.isNotEmpty()) {
                                val animatedProgress by animateFloatAsState(
                                    targetValue = takenIds.size.toFloat() / activeSupplements.size.toFloat(),
                                    animationSpec = GentleSpring,
                                    label = "supp-progress",
                                )
                                LinearProgressIndicator(
                                    progress = { animatedProgress },
                                    modifier = Modifier.fillMaxWidth(),
                                    color = FiberGreen,
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        items(activeSupplements, key = { it.id }) { supplement ->
                            val isTaken = takenIds.contains(supplement.id)
                            SupplementChecklistItem(
                                supplement = supplement,
                                isTaken = isTaken,
                                onEdit = { editingSupplementId = supplement.id },
                                modifier = Modifier.animateItem(),
                                onToggle = {
                                    haptic(HapticFeedbackType.LongPress)
                                    takenIds =
                                        if (isTaken) takenIds - supplement.id else takenIds + supplement.id
                                    scope.launch {
                                        try {
                                            if (isTaken) {
                                                supplementRepo.unlogSupplement(supplement.id, today)
                                            } else {
                                                supplementRepo.logSupplement(supplement.id, today)
                                            }
                                        } catch (e: Exception) {
                                            if (e is kotlinx.coroutines.CancellationException) throw e
                                            takenIds =
                                                if (isTaken) takenIds + supplement.id else takenIds - supplement.id
                                            errorReporter.captureException(e)
                                            snackbarHostState.showSnackbar(updateFailedMessage)
                                        }
                                    }
                                },
                            )
                        }

                        val inactiveSupplements = supplements.filter { !it.isActive }
                        if (inactiveSupplements.isNotEmpty()) {
                            item {
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    stringResource(R.string.supplements_inactive),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            items(inactiveSupplements, key = { it.id }) { supplement ->
                                Card(
                                    modifier = Modifier.fillMaxWidth().animateItem(),
                                    colors =
                                        CardDefaults.cardColors(
                                            containerColor =
                                                MaterialTheme.colorScheme.surfaceVariant
                                                    .copy(alpha = 0.5f),
                                        ),
                                ) {
                                    ListItem(
                                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                        headlineContent = {
                                            Text(supplement.name, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        },
                                        supportingContent = {
                                            Text(
                                                dosageSummary(supplement),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                            )
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

@Composable
fun SupplementChecklistItem(
    supplement: Supplement,
    isTaken: Boolean,
    onToggle: () -> Unit,
    onEdit: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val defaultCardColor = CardDefaults.cardColors().containerColor
    val cardColor by animateColorAsState(
        targetValue = if (isTaken) FiberGreen.copy(alpha = 0.15f) else defaultCardColor,
        animationSpec = spring(dampingRatio = Motion.SNAP_DAMPING, stiffness = Motion.SNAP_STIFFNESS),
        label = "supp-card",
    )
    Card(
        modifier = modifier.fillMaxWidth(),
        onClick = onToggle,
        colors = CardDefaults.cardColors(containerColor = cardColor),
    ) {
        ListItem(
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            headlineContent = {
                Text(
                    supplement.name,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (isTaken) TextDecoration.LineThrough else TextDecoration.None,
                )
            },
            supportingContent = {
                Column {
                    Text(dosageSummary(supplement))
                    supplement.timeOfDay?.let { tod ->
                        Text(
                            timeOfDayDisplayName(tod.value),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    val ings = supplement.ingredients
                    if (ings.size > 1) {
                        Text(
                            ings.joinToString(", ") { ing ->
                                val label = ing.food.ingredientsText
                                if (label.isNullOrBlank()) ing.food.name else "${ing.food.name} $label"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            leadingContent = {
                Checkbox(checked = isTaken, onCheckedChange = { onToggle() })
            },
            trailingContent = {
                Row {
                    onEdit?.let {
                        IconButton(onClick = it) {
                            Icon(
                                Icons.Default.Edit,
                                stringResource(R.string.supplements_edit),
                                modifier =
                                    androidx.compose.ui.Modifier
                                        .size(20.dp),
                            )
                        }
                    }
                    if (isTaken) {
                        Icon(
                            Icons.Default.Check,
                            stringResource(R.string.supplements_taken),
                            tint = FiberGreen.macroTextTone(),
                            modifier =
                                androidx.compose.ui.Modifier
                                    .align(androidx.compose.ui.Alignment.CenterVertically),
                        )
                    }
                }
            },
        )
    }
}
