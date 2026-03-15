package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.model.SupplementLog
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
    var checklist by remember { mutableStateOf<List<SupplementLog>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(date) {
        checklist = supplementRepo.getChecklist(date)
    }

    val takenCount = supplements.count { supp -> checklist.any { it.supplementId == supp.id } }

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
                        contentDescription = "Supplements",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Supplements",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    "$takenCount of ${supplements.size} taken",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            supplements.forEach { supplement ->
                val isTaken = checklist.any { it.supplementId == supplement.id }
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
                            scope.launch {
                                if (checked) {
                                    supplementRepo.logSupplement(supplement.id, date)
                                } else {
                                    supplementRepo.unlogSupplement(supplement.id, date)
                                }
                                checklist = supplementRepo.getChecklist(date)
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
                Text("View All")
            }
        }
    }
}
