package com.bissbilanz.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Entry

@Composable
fun MealCard(
    mealType: String,
    entries: List<Entry>,
    onClick: () -> Unit,
) {
    val totalCalories =
        entries.sumOf {
            it.food?.calories?.times(it.servings) ?: it.quickCalories?.times(it.servings) ?: 0.0
        }
    val totalProtein =
        entries.sumOf {
            it.food?.protein?.times(it.servings) ?: it.quickProtein?.times(it.servings) ?: 0.0
        }
    val totalCarbs =
        entries.sumOf {
            it.food?.carbs?.times(it.servings) ?: it.quickCarbs?.times(it.servings) ?: 0.0
        }
    val totalFat =
        entries.sumOf {
            it.food?.fat?.times(it.servings) ?: it.quickFat?.times(it.servings) ?: 0.0
        }

    Card(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = mealType.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${totalCalories.toInt()} cal",
                    style = MaterialTheme.typography.titleMedium,
                    color = CaloriesBlue,
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("P ${totalProtein.toInt()}g", style = MaterialTheme.typography.labelSmall, color = ProteinRed)
                Text("C ${totalCarbs.toInt()}g", style = MaterialTheme.typography.labelSmall, color = CarbsOrange)
                Text("F ${totalFat.toInt()}g", style = MaterialTheme.typography.labelSmall, color = FatYellow)
            }

            if (entries.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(4.dp))
            }

            entries.forEach { entry ->
                val name = entry.food?.name ?: entry.recipe?.name ?: entry.quickName ?: "Unknown"
                val cal =
                    entry.food?.calories?.times(entry.servings)
                        ?: entry.quickCalories?.times(entry.servings) ?: 0.0
                val servingsText =
                    if (entry.servings != 1.0) {
                        "${if (entry.servings == entry.servings.toLong().toDouble()) {
                            entry.servings.toLong().toString()
                        } else {
                            "%.1f".format(
                                entry.servings,
                            )
                        }}x "
                    } else {
                        ""
                    }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "$servingsText$name",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${cal.toInt()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
