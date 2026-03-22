package com.bissbilanz.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.ui.theme.*
import com.bissbilanz.model.Entry
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedName
import com.bissbilanz.util.resolvedProtein
import com.bissbilanz.util.toDisplayString
import kotlin.math.roundToInt

@Composable
fun MealCard(
    mealType: String,
    entries: List<Entry> = emptyList(),
    onClick: () -> Unit,
    onAddClick: () -> Unit,
) {
    val totalCalories = entries.sumOf { it.resolvedCalories() }
    val totalProtein = entries.sumOf { it.resolvedProtein() }
    val totalCarbs = entries.sumOf { it.resolvedCarbs() }
    val totalFat = entries.sumOf { it.resolvedFat() }

    Card(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = mealType.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${totalCalories.roundToInt()} cal",
                    style = MaterialTheme.typography.titleMedium,
                    color = CaloriesBlue,
                    fontWeight = FontWeight.Bold,
                )
                IconButton(onClick = onAddClick) {
                    Icon(Icons.Default.Add, contentDescription = "Add food")
                }
            }

            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("P ${totalProtein.roundToInt()}g", style = MaterialTheme.typography.labelSmall, color = ProteinRed)
                Text("C ${totalCarbs.roundToInt()}g", style = MaterialTheme.typography.labelSmall, color = CarbsOrange)
                Text("F ${totalFat.roundToInt()}g", style = MaterialTheme.typography.labelSmall, color = FatYellow)
            }

            if (entries.isEmpty()) {
                Text(
                    "No entries",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(4.dp))
            }

            entries.forEachIndexed { index, entry ->
                if (index > 0) {
                    HorizontalDivider(color = DividerDefaults.color.copy(alpha = 0.5f))
                }
                val name = entry.resolvedName()
                val cal = entry.resolvedCalories()
                val servingsText =
                    if (entry.servings != 1.0) {
                        "${entry.servings.toDisplayString()}x "
                    } else {
                        ""
                    }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "$servingsText$name",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${cal.roundToInt()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
