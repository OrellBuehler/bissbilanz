package com.bissbilanz.android.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.health.HealthConnectService
import com.bissbilanz.android.health.HealthImporter
import com.bissbilanz.android.health.HealthSyncPreferences
import com.bissbilanz.android.ui.components.ToggleRow
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * Health Connect settings, mirroring the iOS Apple Health screen: a connection
 * status row, then per-direction toggles so someone whose scale already writes to
 * Health Connect can read without writing back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthConnectScreen(navController: NavController) {
    val health: HealthConnectService = koinInject()
    val prefs: HealthSyncPreferences = koinInject()
    val importer: HealthImporter = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var granted by remember { mutableStateOf<Set<String>>(emptySet()) }
    var readWeight by remember { mutableStateOf(prefs.readWeight) }
    var writeWeight by remember { mutableStateOf(prefs.writeWeight) }
    var readSleep by remember { mutableStateOf(prefs.readSleep) }
    var writeSleep by remember { mutableStateOf(prefs.writeSleep) }
    var writeNutrition by remember { mutableStateOf(prefs.writeNutrition) }
    var isImporting by remember { mutableStateOf(false) }

    val available = remember { health.isAvailable() }
    val needsUpdate = remember { health.needsProviderUpdate() }
    val isConnected = granted.isNotEmpty()

    val importedMessage = stringResource(R.string.health_import_done)
    val nothingMessage = stringResource(R.string.health_import_nothing)

    val permissionLauncher =
        rememberLauncherForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
        ) {
            scope.launch { granted = health.grantedPermissions() }
        }

    LaunchedEffect(Unit) { granted = health.grantedPermissions() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.health_connect_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Favorite,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                stringResource(R.string.health_connect_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                when {
                                    !available -> stringResource(R.string.health_unavailable)
                                    isConnected -> stringResource(R.string.health_connected)
                                    else -> stringResource(R.string.health_not_connected)
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    if (needsUpdate) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            stringResource(R.string.health_needs_provider_update),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    if (available) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { permissionLauncher.launch(health.allPermissions) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                stringResource(
                                    if (isConnected) R.string.health_manage_permissions else R.string.health_connect_action,
                                ),
                            )
                        }
                    }
                }
            }

            if (available && isConnected) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.health_reading_section),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            stringResource(R.string.health_reading_footer),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        HealthToggle(stringResource(R.string.weight_widget_title), readWeight) {
                            readWeight = it
                            prefs.readWeight = it
                        }
                        HealthToggle(stringResource(R.string.sleep_section_title), readSleep) {
                            readSleep = it
                            prefs.readSleep = it
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = {
                                isImporting = true
                                scope.launch {
                                    val imported = importer.importAllIfEnabled()
                                    isImporting = false
                                    snackbarHostState.showSnackbar(
                                        if (imported) importedMessage else nothingMessage,
                                    )
                                }
                            },
                            enabled = !isImporting && (readWeight || readSleep),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (isImporting) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text(stringResource(R.string.health_import_now))
                        }
                    }
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.health_writing_section),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            stringResource(R.string.health_writing_footer),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        HealthToggle(stringResource(R.string.weight_widget_title), writeWeight) {
                            writeWeight = it
                            prefs.writeWeight = it
                        }
                        HealthToggle(stringResource(R.string.sleep_section_title), writeSleep) {
                            writeSleep = it
                            prefs.writeSleep = it
                        }
                        HealthToggle(stringResource(R.string.health_nutrition), writeNutrition) {
                            writeNutrition = it
                            prefs.writeNutrition = it
                        }
                    }
                }
            }

            if (!available) {
                OutlinedButton(
                    onClick = {
                        // Deep-links to the Health Connect listing so the user can
                        // install or update the provider app.
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW).setData(
                                    android.net.Uri.parse(
                                        "market://details?id=com.google.android.apps.healthdata",
                                    ),
                                ),
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.health_install))
                }
            }
        }
    }
}

@Composable
private fun HealthToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    ToggleRow(label = label, checked = checked, onCheckedChange = onCheckedChange)
}
