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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
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
            title = { Text(stringResource(R.string.migration_discard_title)) },
            text = {
                Text(stringResource(R.string.migration_discard_text))
            },
            confirmButton = {
                TextButton(onClick = {
                    showDiscardDialog = false
                    viewModel.startFresh()
                }) { Text(stringResource(R.string.action_discard)) }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardDialog = false }) { Text(stringResource(R.string.dialog_cancel)) }
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
                stringResource(R.string.migration_account_has_data),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(R.string.migration_upload_or_discard),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onUpload, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.migration_upload_button, localItemCount))
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = onStartFresh, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.migration_start_fresh))
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
                stringResource(R.string.migration_uploading_title),
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
                stringResource(R.string.migration_progress_label, stepLabel(step), done, total),
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
                stringResource(R.string.migration_upload_failed_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(R.string.migration_upload_failed_body),
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
                Text(stringResource(R.string.action_retry))
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onContinueWithoutAccount, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.login_continue_without_account))
            }
        }
    }
}

@Composable
private fun stepLabel(step: String): String =
    when (step) {
        LocalDataMigrator.STEP_PREPARE -> stringResource(R.string.migration_step_preparing)
        LocalDataMigrator.STEP_FOODS -> stringResource(R.string.migration_step_uploading_foods)
        LocalDataMigrator.STEP_RECIPES -> stringResource(R.string.migration_step_uploading_recipes)
        LocalDataMigrator.STEP_ENTRIES -> stringResource(R.string.migration_step_uploading_entries)
        LocalDataMigrator.STEP_WEIGHTS -> stringResource(R.string.migration_step_uploading_weights)
        LocalDataMigrator.STEP_SLEEP -> stringResource(R.string.migration_step_uploading_sleep)
        LocalDataMigrator.STEP_SUPPLEMENTS -> stringResource(R.string.migration_step_uploading_supplements)
        LocalDataMigrator.STEP_SUPPLEMENT_LOGS -> stringResource(R.string.migration_step_uploading_supplement_logs)
        LocalDataMigrator.STEP_GOALS -> stringResource(R.string.migration_step_uploading_goals)
        LocalDataMigrator.STEP_PREFERENCES -> stringResource(R.string.migration_step_uploading_preferences)
        LocalDataMigrator.STEP_DAY_PROPERTIES -> stringResource(R.string.migration_step_uploading_day_properties)
        else -> stringResource(R.string.migration_step_uploading)
    }
