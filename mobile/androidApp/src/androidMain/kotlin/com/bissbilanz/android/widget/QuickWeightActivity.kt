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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.model.WeightUpdate
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class QuickWeightActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val weightRepo = koin.get<WeightRepository>()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()

        var todayEntry: WeightEntry? = null
        CoroutineScope(Dispatchers.IO).launch {
            val entries = weightRepo.entries().first()
            todayEntry = entries.find { it.entryDate == today }
            runOnUiThread { showDialog(weightRepo, today, todayEntry) }
        }
    }

    private fun showDialog(
        weightRepo: WeightRepository,
        today: String,
        existingEntry: WeightEntry?,
    ) {
        setContent {
            BissbilanzTheme {
                var weightText by remember {
                    mutableStateOf(
                        if (existingEntry != null) "%.1f".format(existingEntry.weightKg) else "",
                    )
                }
                var notes by remember { mutableStateOf(existingEntry?.notes ?: "") }

                AlertDialog(
                    onDismissRequest = { finish() },
                    title = {
                        Text(
                            if (existingEntry != null) "Edit Weight" else "Log Weight",
                            style = MaterialTheme.typography.titleLarge,
                        )
                    },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedTextField(
                                value = weightText,
                                onValueChange = { weightText = it },
                                label = { Text("Weight (kg)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            OutlinedTextField(
                                value = notes,
                                onValueChange = { notes = it },
                                label = { Text("Notes (optional)") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                        }
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                val weight = weightText.toDoubleOrNull()
                                if (weight != null && weight > 0) {
                                    CoroutineScope(Dispatchers.IO).launch {
                                        if (existingEntry != null) {
                                            weightRepo.updateEntry(
                                                existingEntry.id,
                                                WeightUpdate(weightKg = weight, notes = notes.ifBlank { null }),
                                            )
                                        } else {
                                            weightRepo.createEntry(
                                                WeightCreate(weightKg = weight, entryDate = today, notes = notes.ifBlank { null }),
                                            )
                                        }
                                        QuickWeightWidget.updateAllWidgets(applicationContext)
                                        finish()
                                    }
                                }
                            },
                        ) { Text("Save") }
                    },
                    dismissButton = {
                        TextButton(onClick = { finish() }) { Text("Cancel") }
                    },
                )
            }
        }
    }
}
