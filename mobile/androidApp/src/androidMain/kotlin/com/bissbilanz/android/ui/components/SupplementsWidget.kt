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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.viewmodels.DashboardWidgetsViewModel
import org.koin.androidx.compose.koinViewModel

@Composable
fun SupplementsWidget(
    date: String,
    onViewAll: () -> Unit,
    viewModel: DashboardWidgetsViewModel = koinViewModel(),
) {
    val supplements =
        viewModel.supplements
            .collectAsStateWithLifecycle()
            .value
            .orEmpty()
    val takenByDate by viewModel.takenByDate.collectAsStateWithLifecycle()
    val takenIds = takenByDate[date]

    LaunchedEffect(date) {
        viewModel.loadChecklist(date)
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
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
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                stringResource(R.string.chart_supplements_taken, takenIds?.size ?: 0, supplements.size),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 28.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            supplements.forEach { supplement ->
                val isTaken = takenIds?.contains(supplement.id) == true
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = isTaken,
                        enabled = takenIds != null,
                        onCheckedChange = { checked ->
                            viewModel.setSupplementTaken(supplement.id, date, checked)
                        },
                    )
                    val ings = supplement.ingredients
                    val summary =
                        when {
                            ings.isEmpty() -> {
                                supplement.name
                            }

                            ings.size == 1 -> {
                                ings[0].food.ingredientsText.orEmpty().let { label ->
                                    if (label.isBlank()) supplement.name else "${supplement.name} - $label"
                                }
                            }

                            else -> {
                                stringResource(R.string.supplements_widget_multi_ingredient, supplement.name, ings.size)
                            }
                        }
                    Text(
                        summary,
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
