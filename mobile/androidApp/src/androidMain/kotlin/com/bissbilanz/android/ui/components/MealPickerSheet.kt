package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MealPickerSheet(
    onDismiss: () -> Unit,
    onConfirm: (mealType: String, servings: Double) -> Unit,
    title: String = "Log Food",
    showMealPicker: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedMeal by remember { mutableStateOf("lunch") }
    var servingsText by remember { mutableStateOf("1") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            if (showMealPicker) {
                Text("Meal", style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    mealTypes.forEachIndexed { index, meal ->
                        SegmentedButton(
                            selected = selectedMeal == meal,
                            onClick = { selectedMeal = meal },
                            shape = SegmentedButtonDefaults.itemShape(index, mealTypes.size),
                        ) {
                            Text(
                                meal.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Cancel")
                }
                Button(
                    onClick = {
                        val servings = servingsText.toDoubleOrNull() ?: 1.0
                        if (servings > 0) {
                            scope.launch { sheetState.hide() }.invokeOnCompletion {
                                onConfirm(selectedMeal, servings)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (showMealPicker) "Log" else "Confirm")
                }
            }
        }
    }
}
