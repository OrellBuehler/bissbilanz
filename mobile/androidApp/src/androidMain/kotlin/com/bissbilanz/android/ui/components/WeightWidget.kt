package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun WeightWidget(
    date: String,
    onViewAll: () -> Unit,
    onError: (String) -> Unit = {},
) {
    val weightRepo: WeightRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val allEntries by weightRepo.entries().collectAsStateWithLifecycle(emptyList())
    val scope = rememberCoroutineScope()
    var weightInput by remember { mutableStateOf("") }
    val logFailedMessage = stringResource(R.string.weight_log_failed)

    val latestEntry = allEntries.maxByOrNull { it.entryDate }
    val todayEntry = allEntries.find { it.entryDate == date }

    LaunchedEffect(Unit) {
        // An uncaught throw here kills the recomposer and takes the whole dashboard
        // down; the cached entries above still render, so a failed refresh is silent.
        try {
            weightRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.MonitorWeight,
                        contentDescription = stringResource(R.string.weight_widget_title),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.weight_widget_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                TextButton(onClick = onViewAll) {
                    Text(stringResource(R.string.chart_view_all))
                }
            }

            if (latestEntry != null) {
                Text(
                    stringResource(R.string.weight_kg_value, "%.1f".format(latestEntry.weightKg)),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    latestEntry.entryDate,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (todayEntry == null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = weightInput,
                        onValueChange = { weightInput = it },
                        label = { Text(stringResource(R.string.weight_kg_unit)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            val kg = weightInput.toLocalizedDoubleOrNull()
                            if (kg != null) {
                                scope.launch {
                                    try {
                                        weightRepo.createEntry(WeightCreate(weightKg = kg, entryDate = date))
                                        weightInput = ""
                                    } catch (e: Exception) {
                                        if (e is kotlinx.coroutines.CancellationException) throw e
                                        errorReporter.captureException(e)
                                        onError(logFailedMessage)
                                    }
                                }
                            }
                        },
                        enabled = weightInput.toLocalizedDoubleOrNull() != null,
                    ) {
                        Text(stringResource(R.string.food_detail_log))
                    }
                }
            }
        }
    }
}
