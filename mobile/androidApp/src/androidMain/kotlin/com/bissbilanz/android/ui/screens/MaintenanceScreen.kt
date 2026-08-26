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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.MaintenanceResponse
import com.bissbilanz.repository.AnalyticsRepository
import com.bissbilanz.util.formatAsInt
import com.bissbilanz.util.formatDecimal1
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceScreen(navController: NavController) {
    val analyticsRepo: AnalyticsRepository = koinInject()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isLoading by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<MaintenanceResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
    val rangeOptions = listOf(14, 28, 56, 84)
    var selectedRange by remember { mutableIntStateOf(28) }
    var muscleRatio by remember { mutableFloatStateOf(0.3f) }
    val errorMessage = stringResource(R.string.maintenance_error)

    fun calculate() {
        isLoading = true
        error = null
        scope.launch {
            try {
                val endDate = today.toString()
                val startDate = today.minus(selectedRange, DateTimeUnit.DAY).toString()
                val response = analyticsRepo.getMaintenance(startDate, endDate, muscleRatio.toDouble())
                if (response == null) {
                    error = errorMessage
                }
                result = response
            } catch (e: Exception) {
                error = errorMessage
                result = null
            }
            isLoading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.maintenance_title)) },
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
            // Period selection
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        stringResource(R.string.maintenance_analysis_period),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                        rangeOptions.forEachIndexed { index, days ->
                            SegmentedButton(
                                shape = SegmentedButtonDefaults.itemShape(index, rangeOptions.size),
                                onClick = { selectedRange = days },
                                selected = selectedRange == days,
                            ) {
                                Text(stringResource(R.string.maintenance_range_weeks, days / 7))
                            }
                        }
                    }
                }
            }

            // Muscle ratio slider
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        stringResource(R.string.maintenance_body_composition),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        stringResource(
                            R.string.maintenance_muscle_fat_ratio,
                            (muscleRatio * 100).toInt(),
                            ((1 - muscleRatio) * 100).toInt(),
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Slider(
                        value = muscleRatio,
                        onValueChange = { muscleRatio = it },
                        valueRange = 0f..1f,
                        steps = 9,
                    )
                    Text(
                        stringResource(R.string.maintenance_ratio_hint),
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
                Icon(Icons.Default.Calculate, stringResource(R.string.maintenance_calculate))
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.maintenance_calculate))
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
                            stringResource(R.string.maintenance_results),
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
                                    r.maintenanceCalories.formatAsInt(),
                                    style = MaterialTheme.typography.displayMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = CaloriesBlue.macroTextTone(),
                                )
                                Text(
                                    stringResource(R.string.maintenance_estimated_calories),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider()
                        Spacer(modifier = Modifier.height(16.dp))

                        // Details
                        MaintenanceRow(stringResource(R.string.maintenance_avg_daily_calories), "${r.avgDailyCalories.formatAsInt()} kcal")
                        MaintenanceRow(
                            stringResource(R.string.maintenance_daily_deficit_surplus),
                            "${if (r.dailyDeficit >= 0) "+" else ""}${r.dailyDeficit.formatAsInt()} kcal",
                        )
                        MaintenanceRow(
                            stringResource(R.string.maintenance_weight_change),
                            "${r.weightChangeKg.formatDecimal1()} kg",
                        )
                        MaintenanceRow(
                            stringResource(R.string.maintenance_fat_mass_change),
                            "${r.fatMassKg.formatDecimal1()} kg",
                        )
                        MaintenanceRow(
                            stringResource(R.string.maintenance_muscle_mass_change),
                            "${r.muscleMassKg.formatDecimal1()} kg",
                        )
                    }
                }

                // Meta
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.maintenance_data_coverage),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        MaintenanceRow(
                            stringResource(R.string.maintenance_period),
                            stringResource(R.string.maintenance_period_range, m.startDate, m.endDate),
                        )
                        MaintenanceRow(stringResource(R.string.maintenance_total_days), "${m.totalDays}")
                        MaintenanceRow(stringResource(R.string.maintenance_weight_entries), "${m.weightEntries}")
                        MaintenanceRow(stringResource(R.string.maintenance_food_entry_days), "${m.foodEntryDays}")
                        MaintenanceRow(
                            stringResource(R.string.maintenance_coverage),
                            "${(m.coverage * 100).toInt()}%",
                        )
                        MaintenanceRow(
                            stringResource(R.string.maintenance_start_weight),
                            "${m.firstWeight.formatDecimal1()} kg",
                        )
                        MaintenanceRow(
                            stringResource(R.string.maintenance_end_weight),
                            "${m.lastWeight.formatDecimal1()} kg",
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
                                    stringResource(R.string.maintenance_low_coverage_warning, (m.coverage * 100).toInt()),
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
