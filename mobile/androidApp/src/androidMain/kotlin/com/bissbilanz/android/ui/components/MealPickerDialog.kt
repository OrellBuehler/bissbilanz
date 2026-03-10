package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

val mealTypes = listOf("breakfast", "lunch", "dinner", "snack")

@Composable
fun MealPickerDialog(
    onDismiss: () -> Unit,
    onConfirm: (mealType: String, servings: Double) -> Unit,
    title: String = "Log Food",
) {
    var selectedMeal by remember { mutableStateOf("lunch") }
    var servingsText by remember { mutableStateOf("1") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Meal", style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    mealTypes.forEachIndexed { index, meal ->
                        SegmentedButton(
                            selected = selectedMeal == meal,
                            onClick = { selectedMeal = meal },
                            shape = SegmentedButtonDefaults.itemShape(index, mealTypes.size),
                        ) {
                            Text(meal.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                OutlinedTextField(
                    value = servingsText,
                    onValueChange = { servingsText = it },
                    label = { Text("Servings") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val servings = servingsText.toDoubleOrNull() ?: 1.0
                    if (servings > 0) onConfirm(selectedMeal, servings)
                },
            ) {
                Text("Log")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
