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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.SupplementEditSheet
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.GentleSpring
import com.bissbilanz.android.ui.theme.Motion
import com.bissbilanz.model.Supplement
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementsScreen(navController: NavController) {
    val supplementRepo: SupplementRepository = koinInject()
    val refreshManager: RefreshManager = koinInject()
    val supplements by supplementRepo.supplements().collectAsStateWithLifecycle(emptyList())
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
    var takenIds by remember { mutableStateOf(setOf<String>()) }
    var showCreateSheet by remember { mutableStateOf(false) }
    var editingSupplementId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            supplementRepo.refresh()
        } catch (_: Exception) {
        }
        isLoading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Supplements") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { navController.navigate("supplement-history") }) {
                        Icon(Icons.Default.DateRange, "History")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateSheet = true }) {
                Icon(Icons.Default.Add, "Add supplement")
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
                takenIds = supplementRepo.getChecklist(today).map { it.supplementId }.toSet()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Crossfade(targetState = isLoading, label = "supplements") { loading ->
                if (loading) {
                    LoadingScreen()
                } else if (supplements.isEmpty()) {
                    EmptyState("No supplements yet.\nTap + to add a supplement.")
                } else {
                    val activeSupplements = supplements.filter { it.isActive }

                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        item {
                            Text(
                                "Today's Checklist",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                "${takenIds.size} / ${activeSupplements.size} taken",
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
                                    scope.launch {
                                        try {
                                            if (isTaken) {
                                                supplementRepo.unlogSupplement(supplement.id, today)
                                                takenIds = takenIds - supplement.id
                                            } else {
                                                supplementRepo.logSupplement(supplement.id, today)
                                                takenIds = takenIds + supplement.id
                                            }
                                        } catch (_: Exception) {
                                            snackbarHostState.showSnackbar("Failed to update supplement")
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
                                    "Inactive",
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
                                        headlineContent = {
                                            Text(supplement.name, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        },
                                        supportingContent = {
                                            Text(
                                                "${supplement.dosage.toInt()} ${supplement.dosageUnit}",
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
            headlineContent = {
                Text(
                    supplement.name,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (isTaken) TextDecoration.LineThrough else TextDecoration.None,
                )
            },
            supportingContent = {
                Column {
                    Text("${supplement.dosage.toInt()} ${supplement.dosageUnit}")
                    supplement.timeOfDay?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    supplement.ingredients?.let { ings ->
                        if (ings.isNotEmpty()) {
                            Text(
                                ings.joinToString(", ") { "${it.name} ${it.dosage.toInt()}${it.dosageUnit}" },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
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
                                "Edit",
                                modifier =
                                    androidx.compose.ui.Modifier
                                        .size(20.dp),
                            )
                        }
                    }
                    if (isTaken) {
                        Icon(
                            Icons.Default.Check,
                            "Taken",
                            tint = FiberGreen,
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
