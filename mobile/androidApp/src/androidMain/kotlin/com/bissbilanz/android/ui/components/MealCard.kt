package com.bissbilanz.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bissbilanz.model.Entry

@Composable
fun MealCard(mealType: String, entries: List<Entry>, onClick: () -> Unit) {
    val totalCalories = entries.sumOf {
        it.food?.calories?.times(it.servings) ?: it.quickCalories?.times(it.servings) ?: 0.0
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = mealType.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "${totalCalories.toInt()} cal",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            entries.forEach { entry ->
                val name = entry.food?.name ?: entry.recipe?.name ?: entry.quickName ?: "Unknown"
                val cal = entry.food?.calories?.times(entry.servings)
                    ?: entry.quickCalories?.times(entry.servings) ?: 0.0
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(name, style = MaterialTheme.typography.bodyMedium)
                    Text("${cal.toInt()}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
