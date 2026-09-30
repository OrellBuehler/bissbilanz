package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.BuildConfig
import com.bissbilanz.android.R
import com.bissbilanz.android.sync.AccountDowngradeController
import com.bissbilanz.android.tips.openHelp
import com.bissbilanz.auth.AuthState

@Composable
internal fun AccountCard(
    navController: NavController,
    isLocalMode: Boolean,
    authState: AuthState,
    pendingSyncCount: Long,
    exportingData: Boolean,
    onSignIn: () -> Unit,
    onExportData: () -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_account),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            if (isLocalMode) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    stringResource(R.string.settings_local_mode_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = { onSignIn() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.settings_sign_in_to_sync))
                }
            } else {
                // A dead session leaves the app fully usable on cached data,
                // so it is stated here rather than only as a passing toast —
                // the same warning row plus sign-in action iOS shows. Keyed on
                // "not signed in" rather than on SessionExpired alone: the
                // refresh already deleted both tokens, so after a restart the
                // same stranded user reads as Unauthenticated with a Synced
                // mode, and would otherwise have no way back in.
                if (authState !is AuthState.Authenticated && authState !is AuthState.Refreshing) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            stringResource(R.string.session_expired_message),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = { onSignIn() },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.settings_sign_in_again))
                    }
                }
                // Queued offline writes: surfaced here (and only when
                // there are any) so a stalled upload is visible instead
                // of silently sitting in the queue.
                if (pendingSyncCount > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    SettingsNavItem(
                        stringResource(R.string.pending_sync_row, pendingSyncCount),
                        Icons.Default.Sync,
                    ) {
                        navController.navigate("pending-sync")
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { onExportData() },
                    enabled = !exportingData,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (exportingData) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(stringResource(R.string.settings_export_data))
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onSignOut() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Text(stringResource(R.string.settings_sign_out))
                }
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(
                    onClick = { onDeleteAccount() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Text(stringResource(R.string.settings_delete_account))
                }
            }
        }
    }
}

@Composable
internal fun SettingsFooter(onShowTipsAgain: () -> Unit) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    Spacer(modifier = Modifier.height(16.dp))
    Text(
        stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
    TextButton(
        onClick = { openHelp(context) },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            stringResource(R.string.settings_help_guides),
            style = MaterialTheme.typography.bodySmall,
        )
    }
    TextButton(
        onClick = {
            onShowTipsAgain()
        },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            stringResource(R.string.settings_show_tips_again),
            style = MaterialTheme.typography.bodySmall,
        )
    }
    TextButton(
        onClick = { uriHandler.openUri("https://bissbilanz.orellbuehler.ch/privacy") },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            stringResource(R.string.settings_privacy_policy),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
internal fun AddMealTypeDialog(
    onAdd: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var newMealName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { onDismiss() },
        title = { Text(stringResource(R.string.settings_add_meal_type_title)) },
        text = {
            OutlinedTextField(
                value = newMealName,
                onValueChange = { newMealName = it },
                label = { Text(stringResource(R.string.settings_meal_type_name)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = {
                if (newMealName.isNotBlank()) {
                    onAdd(newMealName.trim())
                }
                onDismiss()
            }) { Text(stringResource(R.string.action_add)) }
        },
        dismissButton = {
            TextButton(onClick = { onDismiss() }) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

@Composable
internal fun DeleteAccountDialog(
    exportingData: Boolean,
    onDowngrade: () -> Unit,
    onExportData: () -> Unit,
    onConfirmDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { onDismiss() },
        title = { Text(stringResource(R.string.settings_delete_account_title)) },
        text = {
            Column {
                Text(stringResource(R.string.settings_delete_account_message))
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = {
                        onDowngrade()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.settings_downgrade_option))
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onExportData() },
                    enabled = !exportingData,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.settings_export_first))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onConfirmDelete()
            }) {
                Text(
                    stringResource(R.string.settings_delete_account_confirm),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = { onDismiss() }) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

@Composable
internal fun DowngradeDialog(
    downgradeState: AccountDowngradeController.State,
    onConfirm: () -> Unit,
    onClose: () -> Unit,
) {
    val downgradeInProgress =
        downgradeState == AccountDowngradeController.State.Syncing ||
            downgradeState == AccountDowngradeController.State.Downloading ||
            downgradeState == AccountDowngradeController.State.Deleting
    AlertDialog(
        onDismissRequest = {
            if (!downgradeInProgress) {
                onClose()
            }
        },
        title = { Text(stringResource(R.string.settings_downgrade_title)) },
        text = {
            Column {
                when (val state = downgradeState) {
                    AccountDowngradeController.State.Idle ->
                        Text(stringResource(R.string.settings_downgrade_message))
                    is AccountDowngradeController.State.Failed -> {
                        Text(stringResource(R.string.settings_downgrade_message))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(stringResource(state.messageRes), color = MaterialTheme.colorScheme.error)
                    }
                    AccountDowngradeController.State.Done ->
                        Text(stringResource(R.string.settings_downgrade_done))
                    else ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                stringResource(
                                    when (downgradeState) {
                                        AccountDowngradeController.State.Syncing ->
                                            R.string.settings_downgrade_progress_sync
                                        AccountDowngradeController.State.Deleting ->
                                            R.string.settings_downgrade_progress_delete
                                        else -> R.string.settings_downgrade_progress_download
                                    },
                                ),
                            )
                        }
                }
            }
        },
        confirmButton = {
            when {
                downgradeState == AccountDowngradeController.State.Done ->
                    TextButton(onClick = {
                        onClose()
                    }) { Text(stringResource(R.string.settings_downgrade_close)) }
                downgradeInProgress -> {}
                else ->
                    TextButton(onClick = { onConfirm() }) {
                        Text(stringResource(R.string.settings_downgrade_confirm))
                    }
            }
        },
        dismissButton = {
            if (!downgradeInProgress && downgradeState != AccountDowngradeController.State.Done) {
                TextButton(onClick = {
                    onClose()
                }) { Text(stringResource(R.string.dialog_cancel)) }
            }
        },
    )
}
