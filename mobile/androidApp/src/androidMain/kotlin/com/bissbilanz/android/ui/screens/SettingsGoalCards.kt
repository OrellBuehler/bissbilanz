package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.ToggleRow
import com.bissbilanz.model.Goals
import com.bissbilanz.model.Preferences
import kotlin.math.roundToInt
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

@Composable
internal fun DailyGoalsCard(
    goals: Goals?,
    onSave: (Goals) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_daily_goals),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(12.dp))

            fun calcGrams(
                pct: Int,
                cals: Int,
                calsPerGram: Int,
            ): Int = ((pct / 100.0) * cals / calsPerGram).roundToInt()

            fun calcPct(
                grams: Double,
                cals: Double,
                calsPerGram: Int,
            ): Int = if (cals <= 0) 0 else ((grams * calsPerGram) / cals * 100).roundToInt()

            var editCalories by remember(goals) {
                mutableStateOf(goals?.calorieGoal?.toInt()?.toString() ?: "2000")
            }
            var editProteinPct by remember(goals) {
                mutableStateOf(
                    goals?.let { g -> calcPct(g.proteinGoal, g.calorieGoal, 4).coerceIn(5, 80) } ?: 30,
                )
            }
            var editCarbsPct by remember(goals) {
                mutableStateOf(
                    goals?.let { g -> calcPct(g.carbGoal, g.calorieGoal, 4).coerceIn(5, 80) } ?: 40,
                )
            }
            var editFiberG by remember(goals) {
                mutableStateOf(goals?.fiberGoal?.toInt() ?: 30)
            }

            val cals = editCalories.toIntOrNull() ?: 2000
            val fatPct = (100 - editProteinPct - editCarbsPct).coerceAtLeast(0)
            val totalPct = editProteinPct + editCarbsPct + fatPct
            val isValid = totalPct == 100

            val proteinG = calcGrams(editProteinPct, cals, 4)
            val carbsG = calcGrams(editCarbsPct, cals, 4)
            val fatG = calcGrams(fatPct, cals, 9)
            val maxFiberG = carbsG.coerceAtLeast(1)

            OutlinedTextField(
                value = editCalories,
                onValueChange = { editCalories = it },
                label = { Text(stringResource(R.string.settings_calories_kcal)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                stringResource(R.string.settings_protein_pct_grams, editProteinPct, proteinG),
                style = MaterialTheme.typography.bodyMedium,
            )
            Slider(
                value = editProteinPct.toFloat(),
                onValueChange = { editProteinPct = it.roundToInt() },
                valueRange = 5f..80f,
                steps = 74,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                stringResource(R.string.settings_carbs_pct_grams, editCarbsPct, carbsG),
                style = MaterialTheme.typography.bodyMedium,
            )
            Slider(
                value = editCarbsPct.toFloat(),
                onValueChange = { editCarbsPct = it.roundToInt() },
                valueRange = 5f..80f,
                steps = 74,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(8.dp))

            GoalRow(
                stringResource(R.string.settings_fat_auto),
                fatG.toDouble(),
                stringResource(R.string.settings_fat_unit_pct, fatPct),
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(stringResource(R.string.settings_fiber_grams, editFiberG), style = MaterialTheme.typography.bodyMedium)
            Slider(
                value = editFiberG.toFloat(),
                onValueChange = { editFiberG = it.roundToInt() },
                valueRange = 0f..maxFiberG.toFloat(),
                steps = (maxFiberG - 1).coerceAtLeast(0),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (isValid) Icons.Default.CheckCircle else Icons.Default.Cancel,
                        contentDescription = null,
                        tint = if (isValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        stringResource(R.string.settings_total_pct, totalPct),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                }
                Button(
                    onClick = {
                        onSave(
                            Goals(
                                calorieGoal = cals.toDouble(),
                                proteinGoal = proteinG.toDouble(),
                                carbGoal = carbsG.toDouble(),
                                fatGoal = fatG.toDouble(),
                                fiberGoal = editFiberG.toDouble(),
                                // Preserved: this form only edits calories/macros, but Goals is
                                // saved as a whole object — omitting these would silently wipe
                                // the sodium/sugar/weight-target goals set elsewhere.
                                sodiumGoal = goals?.sodiumGoal,
                                sugarGoal = goals?.sugarGoal,
                                targetWeightKg = goals?.targetWeightKg,
                                targetDate = goals?.targetDate,
                            ),
                        )
                    },
                    enabled = isValid,
                ) {
                    Text(stringResource(R.string.weight_save))
                }
            }
        }
    }
}

/**
 * Biological sex sits with the goals because that is what it feeds: the nutrient-gap
 * analytics pick sex-specific reference intakes.
 */
@Composable
internal fun BiologicalSexCard(
    prefs: Preferences?,
    onSelect: (GenPreferencesUpdate.BiologicalSex?) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_biological_sex),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_biological_sex_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            val sexOptions =
                listOf(
                    stringResource(R.string.settings_biological_sex_unset) to null,
                    stringResource(R.string.settings_biological_sex_male) to
                        GenPreferencesUpdate.BiologicalSex.male,
                    stringResource(R.string.settings_biological_sex_female) to
                        GenPreferencesUpdate.BiologicalSex.female,
                )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                sexOptions.forEachIndexed { index, (label, value) ->
                    SegmentedButton(
                        shape = SegmentedButtonDefaults.itemShape(index, sexOptions.size),
                        onClick = { onSelect(value) },
                        selected = prefs?.biologicalSex?.value == value?.value,
                    ) {
                        Text(label)
                    }
                }
            }
        }
    }
}

/**
 * Workout goal adjustment: raises the day's calorie/macro goals by a share of
 * activityCalories, whether logged manually or imported from Health Connect.
 */
@Composable
internal fun ActivityGoalAdjustmentCard(
    prefs: Preferences?,
    onAdjustmentChange: (Boolean) -> Unit,
    onCreditPercentChange: (Int) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_activity_goal_adjustment_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            ToggleRow(
                label = stringResource(R.string.settings_activity_goal_adjustment),
                supportingText = stringResource(R.string.settings_activity_goal_adjustment_desc),
                checked = prefs?.activityGoalAdjustment ?: false,
                onCheckedChange = { onAdjustmentChange(it) },
            )
            if (prefs?.activityGoalAdjustment == true) {
                Spacer(modifier = Modifier.height(8.dp))
                var creditDraft by
                    remember(prefs?.activityCreditPercent) {
                        mutableIntStateOf(prefs?.activityCreditPercent ?: 100)
                    }
                Text(
                    stringResource(R.string.settings_activity_credit_percent, creditDraft),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Slider(
                    value = creditDraft.toFloat(),
                    onValueChange = { creditDraft = it.roundToInt() },
                    onValueChangeFinished = { onCreditPercentChange(creditDraft) },
                    valueRange = 0f..100f,
                    steps = 19,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Water goal: the daily target shown as a progress bar on the day log. */
@Composable
internal fun WaterGoalCard(
    waterGoalMl: Int?,
    onUpdate: (Int) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_water_goal),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_water_goal_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            var waterGoalDraft by
                remember(waterGoalMl) {
                    mutableStateOf((waterGoalMl ?: 2000).toString())
                }
            OutlinedTextField(
                value = waterGoalDraft,
                onValueChange = { waterGoalDraft = it },
                label = { Text(stringResource(R.string.settings_water_goal_ml)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier =
                    Modifier.fillMaxWidth().onFocusChanged { focus ->
                        if (!focus.isFocused) {
                            waterGoalDraft.toIntOrNull()?.coerceIn(250, 10000)?.let {
                                onUpdate(it)
                                waterGoalDraft = it.toString()
                            }
                        }
                    },
            )
        }
    }
}

@Composable
fun GoalRow(
    label: String,
    value: Double,
    unit: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurface)
        Text("${value.toInt()} $unit", fontWeight = FontWeight.Medium)
    }
}
