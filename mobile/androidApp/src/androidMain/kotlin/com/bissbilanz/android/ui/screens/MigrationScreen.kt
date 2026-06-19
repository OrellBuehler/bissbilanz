package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.ui.viewmodels.MigrationUiState
import com.bissbilanz.android.ui.viewmodels.MigrationViewModel
import com.bissbilanz.migration.LocalDataMigrator
import org.koin.androidx.compose.koinViewModel

/**
 * Shown when a user signs in while in Local mode: uploads the local data to the account
 * (or lets the user discard it when the account already has data). Routing leaves this
 * screen automatically once the app mode flips to Synced.
 */
@Composable
fun MigrationScreen() {
    val viewModel: MigrationViewModel = koinViewModel()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showDiscardDialog by remember { mutableStateOf(false) }

    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = { showDiscardDialog = false },
            title = { Text("Discard local data?") },
            text = {
                Text(
                    "All foods, recipes, log entries and other data stored on this device " +
                        "will be permanently deleted. The data in your account is kept.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showDiscardDialog = false
                    viewModel.startFresh()
                }) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardDialog = false }) { Text("Cancel") }
            },
        )
    }

    Surface(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            when (val state = uiState) {
                is MigrationUiState.Loading -> {
                    CircularProgressIndicator()
                }

                is MigrationUiState.Choice -> {
                    ChoiceCard(
                        localItemCount = state.localItemCount,
                        onUpload = viewModel::startUpload,
                        onStartFresh = { showDiscardDialog = true },
                    )
                }

                is MigrationUiState.InProgress -> {
                    ProgressCard(done = state.done, total = state.total, step = state.step)
                }

                is MigrationUiState.Failed -> {
                    FailureCard(
                        message = state.message,
                        onRetry = viewModel::retry,
                        onContinueWithoutAccount = viewModel::cancelToLocal,
                    )
                }
            }
        }
    }
}

@Composable
private fun ChoiceCard(
    localItemCount: Int,
    onUpload: () -> Unit,
    onStartFresh: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
            Text(
                "Your account already has data",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "You can upload the data stored on this device to your account, " +
                    "or discard it and continue with your account data only.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onUpload, modifier = Modifier.fillMaxWidth()) {
                Text("Upload local data ($localItemCount items)")
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = onStartFresh, modifier = Modifier.fillMaxWidth()) {
                Text("Start fresh (discard local data)")
            }
        }
    }
}

@Composable
private fun ProgressCard(
    done: Int,
    total: Int,
    step: String,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Uploading your data",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(16.dp))
            LinearProgressIndicator(
                progress = { if (total > 0) done.toFloat() / total else 0f },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                "${stepLabel(step)} ($done/$total)…",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun FailureCard(
    message: String,
    onRetry: () -> Unit,
    onContinueWithoutAccount: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
            Text(
                "Upload failed",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Your local data is safe — already uploaded items are not lost and the " +
                    "upload continues where it stopped.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
                Text("Retry")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onContinueWithoutAccount, modifier = Modifier.fillMaxWidth()) {
                Text("Continue without account")
            }
        }
    }
}

private fun stepLabel(step: String): String =
    when (step) {
        LocalDataMigrator.STEP_PREPARE -> "Preparing"
        LocalDataMigrator.STEP_FOODS -> "Uploading foods"
        LocalDataMigrator.STEP_RECIPES -> "Uploading recipes"
        LocalDataMigrator.STEP_ENTRIES -> "Uploading entries"
        LocalDataMigrator.STEP_WEIGHTS -> "Uploading weight entries"
        LocalDataMigrator.STEP_SLEEP -> "Uploading sleep entries"
        LocalDataMigrator.STEP_SUPPLEMENTS -> "Uploading supplements"
        LocalDataMigrator.STEP_SUPPLEMENT_LOGS -> "Uploading supplement logs"
        LocalDataMigrator.STEP_GOALS -> "Uploading goals"
        LocalDataMigrator.STEP_PREFERENCES -> "Uploading preferences"
        LocalDataMigrator.STEP_DAY_PROPERTIES -> "Uploading day properties"
        else -> "Uploading"
    }
