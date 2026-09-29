package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.util.MAX_RECIPE_STEPS
import com.bissbilanz.util.MAX_RECIPE_STEP_TEXT
import com.bissbilanz.util.RecipeStepDraft
import com.bissbilanz.util.moved
import com.bissbilanz.util.newTempId

/**
 * The "Steps" section of the recipe form: a numbered card per step with multi-line
 * text, up/down reordering, removal and an optional photo. The list itself is owned
 * by the caller so the form can send it along with the rest of the recipe.
 */
@Composable
fun RecipeStepsEditor(
    steps: List<RecipeStepDraft>,
    onStepsChange: (List<RecipeStepDraft>) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.recipe_edit_steps_count, steps.size),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            FilledTonalButton(
                onClick = { onStepsChange(steps + RecipeStepDraft(key = newTempId())) },
                enabled = steps.size < MAX_RECIPE_STEPS,
            ) {
                Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(stringResource(R.string.action_add))
            }
        }

        steps.forEachIndexed { index, step ->
            key(step.key) {
                val number = index + 1
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                stringResource(R.string.recipe_edit_step_label, number),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(
                                onClick = { onStepsChange(steps.moved(index, -1)) },
                                enabled = index > 0,
                            ) {
                                Icon(
                                    Icons.Default.KeyboardArrowUp,
                                    stringResource(R.string.recipe_edit_step_move_up, number),
                                )
                            }
                            IconButton(
                                onClick = { onStepsChange(steps.moved(index, 1)) },
                                enabled = index < steps.lastIndex,
                            ) {
                                Icon(
                                    Icons.Default.KeyboardArrowDown,
                                    stringResource(R.string.recipe_edit_step_move_down, number),
                                )
                            }
                            IconButton(onClick = { onStepsChange(steps.filterIndexed { i, _ -> i != index }) }) {
                                Icon(
                                    Icons.Default.Close,
                                    stringResource(R.string.recipe_edit_step_remove, number),
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                        OutlinedTextField(
                            value = step.text,
                            onValueChange = { text ->
                                if (text.length <= MAX_RECIPE_STEP_TEXT) {
                                    onStepsChange(steps.map { if (it.key == step.key) it.copy(text = text) else it })
                                }
                            },
                            label = { Text(stringResource(R.string.recipe_edit_step_hint)) },
                            minLines = 3,
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        RecipeStepPhotoField(
                            stepNumber = number,
                            imageUrl = step.imageUrl,
                            onImageUrlChange = { url ->
                                onStepsChange(steps.map { if (it.key == step.key) it.copy(imageUrl = url) else it })
                            },
                        )
                    }
                }
            }
        }

        if (steps.isEmpty()) {
            Text(
                stringResource(R.string.recipe_edit_no_steps),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
