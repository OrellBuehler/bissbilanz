package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.util.formatDecimal1
import com.bissbilanz.util.formatNutrient
import org.koin.compose.koinInject

/**
 * Dashboard card showing the most recent night, mirroring the iOS sleep widget.
 * Tapping through opens the dedicated sleep screen — logging happens there so
 * bed/wake times and wake-ups stay available.
 */
@Composable
fun SleepWidget(onViewAll: () -> Unit) {
    val sleepRepo: SleepRepository = koinInject()
    val entries by sleepRepo.entries().collectAsStateWithLifecycle(emptyList())

    val latest = entries.maxByOrNull { it.entryDate }

    LaunchedEffect(Unit) {
        sleepRepo.refresh()
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
                        Icons.Default.Bedtime,
                        contentDescription = stringResource(R.string.sleep_section_title),
                        tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.sleep_section_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                TextButton(onClick = onViewAll) {
                    Text(stringResource(R.string.chart_view_all))
                }
            }

            if (latest != null) {
                Text(
                    "${(latest.durationMinutes / 60.0).formatDecimal1()}h",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    stringResource(R.string.sleep_quality_value, latest.quality.formatNutrient()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    latest.entryDate,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    stringResource(R.string.sleep_no_entries),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
