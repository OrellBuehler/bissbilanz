package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

/** The server's `weightUpdateSchema` bound. */
private const val MAX_WEIGHT_KG = 500.0

class QuickWeightActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.wrap(newBase))
    }

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
                var saving by remember { mutableStateOf(false) }
                var saveError by remember { mutableStateOf<Int?>(null) }
                val scope = rememberCoroutineScope()

                LaunchedEffect(Unit) {
                    // A widget placed before a logout still opens this dialog; a weight
                    // saved now would be queued for whichever account signs in next.
                    if (!widgetsSignedIn()) {
                        startActivity(Intent(this@QuickWeightActivity, MainActivity::class.java))
                        finish()
                        return@LaunchedEffect
                    }
                    val entries = weightRepo.entries().first()
                    existingEntry = entries.find { it.entryDate == today }
                    loaded = true
                }

                if (loaded) {
                    WeightDialog(
                        existingEntry = existingEntry,
                        saving = saving,
                        saveError = saveError,
                        // Leaving mid-save would cancel the write with the dialog.
                        onDismiss = { if (!saving) finish() },
                        onSave = { weight, notes ->
                            val entry = existingEntry
                            saving = true
                            saveError = null
                            scope.launch {
                                try {
                                    if (entry != null) {
                                        weightRepo.updateEntry(
                                            entry.id,
                                            WeightUpdate(
                                                weightKg = weight,
                                                // A null note means "unchanged", so an emptied
                                                // note is sent as "" to actually clear it.
                                                notes = notes.ifBlank { if (entry.notes.isNullOrBlank()) null else "" },
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
                                    finish()
                                } catch (e: Exception) {
                                    if (e is CancellationException) throw e
                                    errorReporter.captureException(e)
                                    saveError = if (entry != null) R.string.weight_update_failed else R.string.weight_log_failed
                                    saving = false
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
    saving: Boolean,
    saveError: Int?,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit,
) {
    val locale = LocalConfiguration.current.locales[0]
    var weightText by rememberSaveable {
        mutableStateOf(existingEntry?.let { String.format(locale, "%.1f", it.weightKg) } ?: "")
    }
    var notes by rememberSaveable { mutableStateOf(existingEntry?.notes ?: "") }
    var invalid by rememberSaveable { mutableStateOf(false) }

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
                    onValueChange = {
                        weightText = it
                        invalid = false
                    },
                    label = { Text(stringResource(R.string.weight_input_label)) },
                    isError = invalid,
                    supportingText =
                        if (invalid) {
                            { Text(stringResource(R.string.weight_input_invalid)) }
                        } else {
                            null
                        },
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
                if (saveError != null) {
                    Text(
                        stringResource(saveError),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val weight = weightText.toLocalizedDoubleOrNull()
                    if (weight != null && weight > 0 && weight <= MAX_WEIGHT_KG) {
                        onSave(weight, notes)
                    } else {
                        invalid = true
                    }
                },
            ) { Text(stringResource(R.string.weight_save), maxLines = 1) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.weight_cancel), maxLines = 1) }
        },
    )
}
