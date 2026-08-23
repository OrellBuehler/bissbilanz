package com.bissbilanz.android.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.ALL_NUTRIENT_KEYS
import com.bissbilanz.android.ui.screens.nutrientCategories

@Composable
fun QuickNutrientInputs(
    nutrients: Map<String, String>,
    onNutrientsChange: (Map<String, String>) -> Unit,
    visibleNutrientKeys: Set<String>?,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(nutrients.isNotEmpty()) }
    var showNutrientPicker by remember { mutableStateOf(false) }
    val catalog = nutrientCategories()
    val labels = remember(catalog) { catalog.flatMap { (_, entries) -> entries }.toMap() }
    val allowedKeys = visibleNutrientKeys?.takeIf { it.isNotEmpty() } ?: ALL_NUTRIENT_KEYS.toSet()

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { expanded = !expanded }) {
            Icon(
                if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(stringResource(R.string.quick_add_more_nutrients))
        }
        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                nutrients.keys.sorted().forEach { key ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(modifier = Modifier.weight(1f)) {
                            NutrientTextField(labels[key] ?: key, nutrients[key] ?: "") { value ->
                                onNutrientsChange(nutrients + (key to value))
                            }
                        }
                        IconButton(onClick = { onNutrientsChange(nutrients - key) }) {
                            Icon(
                                Icons.Default.Close,
                                stringResource(R.string.food_form_remove_nutrient),
                            )
                        }
                    }
                }
                Box {
                    TextButton(onClick = { showNutrientPicker = true }) {
                        Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(stringResource(R.string.food_form_add_nutrient))
                    }
                    DropdownMenu(
                        expanded = showNutrientPicker,
                        onDismissRequest = { showNutrientPicker = false },
                    ) {
                        catalog.forEach { (category, entries) ->
                            val available =
                                entries.filter { (key, _) -> key in allowedKeys && key !in nutrients }
                            if (available.isEmpty()) return@forEach
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        category,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                },
                                onClick = {},
                                enabled = false,
                            )
                            available.forEach { (key, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        onNutrientsChange(nutrients + (key to ""))
                                        showNutrientPicker = false
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
