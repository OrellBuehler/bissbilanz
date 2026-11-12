package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.bulk.formatCount
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.ErrorState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.viewmodels.EnhanceFoodsViewModel
import com.bissbilanz.android.ui.viewmodels.UiMessageSnackbar
import com.bissbilanz.android.util.formatIsoDateTime
import com.bissbilanz.api.generated.model.FoodEnrichmentJob
import com.bissbilanz.api.generated.model.FoodEnrichmentStatusResponse
import org.koin.androidx.compose.koinViewModel
import java.text.NumberFormat

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnhanceFoodsScreen(navController: NavController) {
    val viewModel: EnhanceFoodsViewModel = koinViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    val snackbarMessage by viewModel.snackbarMessage.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    UiMessageSnackbar(snackbarMessage, snackbarHostState, viewModel::clearSnackbar)

    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) { viewModel.pollWhileVisible() }
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            AppTopBar(
                scrollBehavior = scrollBehavior,
                title = stringResource(R.string.enhance_foods_title),
                onBack = { navController.popBackStack() },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            val status = state.status
            when {
                viewModel.isLocalMode ->
                    EmptyState(message = stringResource(R.string.enhance_foods_needs_account), icon = Icons.Outlined.CloudOff)
                status == null && !isOnline ->
                    EmptyState(message = stringResource(R.string.enhance_foods_offline), icon = Icons.Outlined.CloudOff)
                status == null && state.loadStalled ->
                    ErrorState(message = stringResource(R.string.enhance_foods_load_failed), onRetry = viewModel::retry)
                status == null -> LoadingScreen()
                else ->
                    PullToRefreshWrapper(onRefresh = { viewModel.refresh() }, modifier = Modifier.fillMaxSize()) {
                        EnhanceFoodsContent(
                            status = status,
                            state = state,
                            isOnline = isOnline,
                            onStart = viewModel::start,
                            onStop = viewModel::stop,
                            onRetry = viewModel::retry,
                        )
                    }
            }
        }
    }
}

@Composable
internal fun EnhanceFoodsContent(
    status: FoodEnrichmentStatusResponse,
    state: EnhanceFoodsViewModel.UiState,
    isOnline: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onRetry: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.enhance_foods_description),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        when {
            !isOnline -> Notice(stringResource(R.string.enhance_foods_offline))
            state.loadStalled ->
                Notice(stringResource(R.string.enhance_foods_load_failed)) {
                    OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.action_retry), maxLines = 1) }
                }
        }
        if (state.rateLimited) Notice(stringResource(R.string.enhance_foods_rate_limited))

        val job = state.job
        if (job != null && state.isActive) {
            ActiveRunCard(job)
            OutlinedButton(
                onClick = onStop,
                enabled = isOnline && state.canStop,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Stop, null, modifier = Modifier.size(ButtonDefaults.IconSize))
                Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                Text(stringResource(R.string.enhance_foods_stop), maxLines = 1)
            }
        } else {
            Text(
                when {
                    status.candidates > 0 -> stringResource(R.string.enhance_foods_candidates, formatCount(status.candidates))
                    state.hasBarcodeFoods -> stringResource(R.string.enhance_foods_none)
                    else -> stringResource(R.string.enhance_foods_no_barcodes)
                },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
            job?.let { LastRunCard(it) }
            Button(
                onClick = onStart,
                enabled = isOnline && state.canStart,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.busy) {
                    CircularProgressIndicator(modifier = Modifier.size(ButtonDefaults.IconSize), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.AutoFixHigh, null, modifier = Modifier.size(ButtonDefaults.IconSize))
                }
                Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
                Text(stringResource(R.string.enhance_foods_start), maxLines = 1)
            }
        }
    }
}

@Composable
private fun ActiveRunCard(job: FoodEnrichmentJob) {
    val progress = if (job.total > 0) (job.processed.toFloat() / job.total).coerceIn(0f, 1f) else 0f
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (job.state == "queued") {
                        stringResource(R.string.enhance_foods_queued)
                    } else {
                        stringResource(R.string.enhance_foods_progress, formatCount(job.processed), formatCount(job.total))
                    },
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                if (job.state != "queued") {
                    Text(
                        NumberFormat.getPercentInstance().format(progress),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
            if (job.state == "queued" || job.total == 0) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            }
            CountsText(job)
            Text(
                stringResource(R.string.enhance_foods_background),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LastRunCard(job: FoodEnrichmentJob) {
    val date = (job.finishedAt ?: job.startedAt)?.let { formatIsoDateTime(it) }
    val processed = formatCount(job.processed)
    val total = formatCount(job.total)
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (date != null) {
                Text(
                    when (job.state) {
                        "cancelled" -> stringResource(R.string.enhance_foods_last_cancelled, date, processed, total)
                        "failed" -> stringResource(R.string.enhance_foods_last_failed, date, processed, total)
                        else -> stringResource(R.string.enhance_foods_last_completed, date, processed)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            CountsText(job)
        }
    }
}

@Composable
private fun CountsText(job: FoodEnrichmentJob) {
    Text(
        stringResource(R.string.enhance_foods_counts, formatCount(job.updated), formatCount(job.notFound), formatCount(job.failed)),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun Notice(
    text: String,
    action: (@Composable () -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.weight(1f),
            )
            action?.invoke()
        }
    }
}
