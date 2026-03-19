package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.MaintenanceResponse
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceScreen(navController: NavController) {
    val api: BissbilanzApi = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<MaintenanceResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    val rangeOptions =
        listOf(
            "2 Weeks" to 14,
            "4 Weeks" to 28,
            "8 Weeks" to 56,
            "12 Weeks" to 84,
        )
    var selectedRange by remember { mutableIntStateOf(28) }
    var muscleRatio by remember { mutableFloatStateOf(0.3f) }

    fun calculate() {
        isLoading = true
        error = null
        scope.launch {
            try {
                val endDate = today.toString()
                val startDate = today.minus(selectedRange, DateTimeUnit.DAY).toString()
                result = api.getMaintenanceCalories(startDate, endDate, muscleRatio.toDouble())
            } catch (e: Exception) {
                error = "Could not calculate. Ensure you have enough weight entries and food logs in the selected range."
                result = null
            }
            isLoading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Maintenance Calculator") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
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
            // Period selection
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Analysis Period",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                        rangeOptions.forEachIndexed { index, (label, days) ->
                            SegmentedButton(
                                shape = SegmentedButtonDefaults.itemShape(index, rangeOptions.size),
                                onClick = { selectedRange = days },
                                selected = selectedRange == days,
                            ) {
                                Text(label)
                            }
                        }
                    }
                }
            }

            // Muscle ratio slider
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Body Composition",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Muscle/Fat ratio: ${(muscleRatio * 100).toInt()}% muscle / ${((1 - muscleRatio) * 100).toInt()}% fat",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Slider(
                        value = muscleRatio,
                        onValueChange = { muscleRatio = it },
                        valueRange = 0f..1f,
                        steps = 9,
                    )
                    Text(
                        "Adjusts how weight change is split between muscle and fat gain/loss",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Calculate button
            Button(
                onClick = { calculate() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Icon(Icons.Default.Calculate, "Calculate")
                Spacer(modifier = Modifier.width(8.dp))
                Text("Calculate")
            }

            // Error
            error?.let {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors =
                        CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                ) {
                    Text(
                        it,
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            // Results
            result?.let { response ->
                val r = response.result
                val m = response.meta

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Results",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        // Main result
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "${r.maintenanceCalories.toInt()}",
                                    style = MaterialTheme.typography.displayMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = CaloriesBlue,
                                )
                                Text(
                                    "Estimated maintenance calories",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider()
                        Spacer(modifier = Modifier.height(16.dp))

                        // Details
                        MaintenanceRow("Avg daily calories", "${r.avgDailyCalories.toInt()} kcal")
                        MaintenanceRow(
                            "Daily deficit/surplus",
                            "${if (r.dailyDeficit >= 0) "+" else ""}${r.dailyDeficit.toInt()} kcal",
                        )
                        MaintenanceRow(
                            "Weight change",
                            "${"%.1f".format(r.weightChangeKg)} kg",
                        )
                        MaintenanceRow(
                            "Fat mass change",
                            "${"%.1f".format(r.fatMassKg)} kg",
                        )
                        MaintenanceRow(
                            "Muscle mass change",
                            "${"%.1f".format(r.muscleMassKg)} kg",
                        )
                    }
                }

                // Meta
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Data Coverage",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        MaintenanceRow("Period", "${m.startDate} to ${m.endDate}")
                        MaintenanceRow("Total days", "${m.totalDays}")
                        MaintenanceRow("Weight entries", "${m.weightEntries}")
                        MaintenanceRow("Food entry days", "${m.foodEntryDays}")
                        MaintenanceRow(
                            "Coverage",
                            "${(m.coverage * 100).toInt()}%",
                        )
                        MaintenanceRow(
                            "Start weight",
                            "${"%.1f".format(m.firstWeight)} kg",
                        )
                        MaintenanceRow(
                            "End weight",
                            "${"%.1f".format(m.lastWeight)} kg",
                        )

                        if (m.coverage < 0.7) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Card(
                                colors =
                                    CardDefaults.cardColors(
                                        containerColor = FatYellow.copy(alpha = 0.15f),
                                    ),
                            ) {
                                Text(
                                    "Low data coverage (${(m.coverage * 100).toInt()}%). Results may be less accurate. Aim for >70% coverage.",
                                    modifier = Modifier.padding(12.dp),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun MaintenanceRow(
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
    }
}
