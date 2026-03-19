package com.bissbilanz.android.widget

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import java.util.Locale

class QuickWeightActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val weightRepo = koin.get<WeightRepository>()
        val errorReporter = koin.get<ErrorReporter>()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

        setContent {
            BissbilanzTheme {
                var existingEntry by remember { mutableStateOf<WeightEntry?>(null) }
                var loaded by remember { mutableStateOf(false) }

                LaunchedEffect(Unit) {
                    val entries = weightRepo.entries().first()
                    existingEntry = entries.find { it.entryDate == today }
                    loaded = true
                }

                if (loaded) {
                    WeightDialog(
                        existingEntry = existingEntry,
                        onDismiss = { finish() },
                        onSave = { weight, notes ->
                            val entry = existingEntry
                            lifecycleScope.launch(Dispatchers.IO) {
                                try {
                                    if (entry != null) {
                                        weightRepo.updateEntry(
                                            entry.id,
                                            WeightUpdate(
                                                weightKg = weight,
                                                notes = notes.ifBlank { null },
                                            ),
                                        )
                                    } else {
                                        weightRepo.createEntry(
                                            WeightCreate(
                                                weightKg = weight,
                                                entryDate = today,
                                                notes = notes.ifBlank { null },
                                            ),
                                        )
                                    }
                                } catch (e: Exception) {
                                    errorReporter.captureException(e)
                                } finally {
                                    withContext(Dispatchers.Main) { finish() }
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun WeightDialog(
    existingEntry: WeightEntry?,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    var weightText by remember {
        mutableStateOf(
            if (existingEntry != null) {
                String.format(Locale.US, "%.1f", existingEntry.weightKg)
            } else {
                ""
            },
        )
    }
    var notes by remember { mutableStateOf(existingEntry?.notes ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                stringResource(
                    if (existingEntry != null) R.string.weight_edit_title else R.string.weight_log_title,
                ),
                style = MaterialTheme.typography.titleLarge,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text(stringResource(R.string.weight_input_label)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(stringResource(R.string.weight_notes_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val weight = weightText.replace(',', '.').toDoubleOrNull()
                    if (weight != null && weight > 0) onSave(weight, notes)
                },
            ) { Text(stringResource(R.string.weight_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.weight_cancel)) }
        },
    )
}
