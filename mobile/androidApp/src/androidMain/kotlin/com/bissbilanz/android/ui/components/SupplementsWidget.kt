package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun SupplementsWidget(
    date: String,
    onViewAll: () -> Unit,
) {
    val supplementRepo: SupplementRepository = koinInject()
    val supplements by supplementRepo.supplements().collectAsStateWithLifecycle(emptyList())
    var takenIds by remember { mutableStateOf(setOf<String>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(date) {
        takenIds = supplementRepo.getChecklist(date).map { it.supplementId }.toSet()
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
                        Icons.Default.Medication,
                        contentDescription = stringResource(R.string.chart_supplements),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.chart_supplements),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    stringResource(R.string.chart_supplements_taken, takenIds.size, supplements.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            supplements.forEach { supplement ->
                val isTaken = takenIds.contains(supplement.id)
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = isTaken,
                        onCheckedChange = { checked ->
                            takenIds =
                                if (checked) takenIds + supplement.id else takenIds - supplement.id
                            scope.launch {
                                try {
                                    if (checked) {
                                        supplementRepo.logSupplement(supplement.id, date)
                                    } else {
                                        supplementRepo.unlogSupplement(supplement.id, date)
                                    }
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    takenIds =
                                        if (checked) takenIds - supplement.id else takenIds + supplement.id
                                }
                            }
                        },
                    )
                    Text(
                        "${supplement.name} - ${supplement.dosage.toInt()}${supplement.dosageUnit}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(
                onClick = onViewAll,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text(stringResource(R.string.chart_view_all))
            }
        }
    }
}
