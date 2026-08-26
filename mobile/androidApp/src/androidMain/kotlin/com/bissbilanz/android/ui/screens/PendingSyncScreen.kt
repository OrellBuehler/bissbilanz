package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.sync.QueuedRequest
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * The offline sync queue — every local change still waiting to upload, with its
 * kind, age and retry count, plus a manual retry. Mirrors the iOS PendingSyncView
 * reached from the "N changes waiting to sync" row in Settings.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PendingSyncScreen(navController: NavController) {
    val syncQueue: SyncQueue = koinInject()
    val syncManager: SyncManager = koinInject()
    val syncState by syncManager.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var pending by remember { mutableStateOf<List<QueuedRequest>>(emptyList()) }

    // Re-read whenever the queue drains or something new is enqueued, so the
    // list tracks the same state the sync manager reports.
    LaunchedEffect(syncState.pendingCount, syncState.isSyncing) {
        pending = syncQueue.all()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.pending_sync_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (pending.isNotEmpty()) {
                        IconButton(
                            onClick = { scope.launch { syncManager.syncPendingQueue() } },
                            enabled = !syncState.isSyncing,
                        ) {
                            Icon(Icons.Default.Refresh, stringResource(R.string.pending_sync_retry_now))
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (pending.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(48.dp),
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    stringResource(R.string.pending_sync_empty),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    stringResource(R.string.pending_sync_empty_detail),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                syncState.errors.lastOrNull()?.let { error ->
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onErrorContainer,
                                )
                                Text(
                                    error,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                )
                            }
                        }
                    }
                }

                items(pending, key = { it.id }) { request ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        ListItem(
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            leadingContent = {
                                Icon(
                                    iconFor(request.operation),
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            headlineContent = { Text(stringResource(labelFor(request.operation))) },
                            supportingContent = {
                                if (request.retryCount > 0) {
                                    Text(
                                        stringResource(R.string.pending_sync_retry_count, request.retryCount),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

private fun iconFor(op: SyncOperation): ImageVector =
    when (op) {
        is SyncOperation.DeleteFood,
        is SyncOperation.DeleteEntry,
        is SyncOperation.DeleteRecipe,
        is SyncOperation.DeleteSleep,
        is SyncOperation.DeleteSupplement,
        -> Icons.Default.Delete

        is SyncOperation.UpdateFood,
        is SyncOperation.UpdateEntry,
        is SyncOperation.UpdateRecipe,
        is SyncOperation.UpdateSleep,
        is SyncOperation.UpdateSupplement,
        -> Icons.Default.Edit

        else -> Icons.Default.Sync
    }

private fun labelFor(op: SyncOperation): Int =
    when (op) {
        is SyncOperation.CreateEntry -> R.string.sync_create_entry
        is SyncOperation.UpdateEntry -> R.string.sync_update_entry
        is SyncOperation.DeleteEntry -> R.string.sync_delete_entry
        is SyncOperation.CreateFood -> R.string.sync_create_food
        is SyncOperation.UpdateFood -> R.string.sync_update_food
        is SyncOperation.DeleteFood -> R.string.sync_delete_food
        is SyncOperation.ToggleFavorite -> R.string.sync_toggle_favorite
        is SyncOperation.CreateRecipe -> R.string.sync_create_recipe
        is SyncOperation.UpdateRecipe -> R.string.sync_update_recipe
        is SyncOperation.DeleteRecipe -> R.string.sync_delete_recipe
        is SyncOperation.CreateSleep -> R.string.sync_create_sleep
        is SyncOperation.UpdateSleep -> R.string.sync_update_sleep
        is SyncOperation.DeleteSleep -> R.string.sync_delete_sleep
        is SyncOperation.LogSupplement -> R.string.sync_log_supplement
        is SyncOperation.SetGoals -> R.string.sync_set_goals
        else -> R.string.sync_generic_change
    }
