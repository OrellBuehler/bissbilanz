package com.bissbilanz.android.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskNotifier
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.viewmodels.AiTasksViewModel
import com.bissbilanz.api.generated.model.AiTask
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel
import org.koin.core.qualifier.named

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiTasksScreen(navController: NavController) {
    val viewModel: AiTasksViewModel = koinViewModel()
    val baseUrl: String = koinInject(named("baseUrl"))
    val context = LocalContext.current
    val tasks by viewModel.visibleTasks.collectAsStateWithLifecycle(emptyList())
    val selectedFilter by viewModel.filter.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    var taskToDelete by remember { mutableStateOf<AiTask?>(null) }

    val filters =
        listOf(
            AiTasksViewModel.Filter.OPEN to stringResource(R.string.ai_tasks_filter_open),
            AiTasksViewModel.Filter.COMPLETED to stringResource(R.string.ai_tasks_filter_completed),
            AiTasksViewModel.Filter.DISMISSED to stringResource(R.string.ai_tasks_filter_dismissed),
        )

    // Asked at the moment of intent, matching how supplement reminders do it: the
    // unread state still shows in this list without the permission, only the
    // out-of-app notification is missing.
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !AiTaskNotifier.hasPermission(context)
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        // Opening the list is what marks the outcomes as read — posting a
        // notification does not, so the user's other devices still get to tell them.
        viewModel.load()
    }

    taskToDelete?.let { task ->
        AlertDialog(
            onDismissRequest = { taskToDelete = null },
            title = { Text(stringResource(R.string.ai_tasks_delete)) },
            text = { Text(stringResource(R.string.ai_tasks_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.delete(task.id)
                    taskToDelete = null
                }) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { taskToDelete = null }) {
                    Text(stringResource(R.string.dialog_cancel))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ai_tasks_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                filters.forEachIndexed { index, (filter, label) ->
                    SegmentedButton(
                        selected = selectedFilter == filter,
                        onClick = { viewModel.selectFilter(filter) },
                        shape = SegmentedButtonDefaults.itemShape(index, filters.size),
                    ) {
                        Text(label)
                    }
                }
            }

            PullToRefreshWrapper(
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.fillMaxSize(),
            ) {
                Crossfade(targetState = isLoading, label = "ai-tasks") { loading ->
                    if (loading) {
                        LoadingScreen()
                    } else if (tasks.isEmpty()) {
                        EmptyState(stringResource(selectedFilter.emptyMessage), Icons.Default.AutoAwesome)
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp),
                        ) {
                            items(tasks, key = { it.id }) { task ->
                                AiTaskListItem(
                                    task = task,
                                    baseUrl = baseUrl,
                                    onDelete = { taskToDelete = task },
                                    modifier = Modifier.animateItem(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AiTaskListItem(
    task: AiTask,
    baseUrl: String,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isUnread = task.status == AiTask.Status.dismissed && task.acknowledgedAt == null
    Card(
        modifier = modifier.fillMaxWidth(),
        colors =
            if (isUnread) {
                CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
            } else {
                CardDefaults.cardColors()
            },
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                task.photoUrl?.let { url ->
                    AsyncImage(
                        model = if (url.startsWith("/")) "$baseUrl$url" else url,
                        contentDescription = null,
                        modifier = Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Crop,
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        buildString {
                            append(task.date)
                            task.mealType?.let { append(" · ").append(it) }
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val description = task.description
                    if (description.isNullOrBlank()) {
                        Text(
                            stringResource(R.string.ai_tasks_photo_only),
                            style = MaterialTheme.typography.bodyMedium,
                            fontStyle = FontStyle.Italic,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Text(description, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (isUnread) {
                    Badge { Text(stringResource(R.string.ai_tasks_unread)) }
                    Spacer(modifier = Modifier.width(4.dp))
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Default.Delete,
                        stringResource(R.string.ai_tasks_delete),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // The assistant's own words. On a dismissal this is the whole point of the
            // screen — it says why the meal was not logged — so it gets a real surface
            // rather than a muted caption.
            task.resultSummary?.takeIf { it.isNotBlank() }?.let { summary ->
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            stringResource(R.string.ai_tasks_agent_comment),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(summary, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
