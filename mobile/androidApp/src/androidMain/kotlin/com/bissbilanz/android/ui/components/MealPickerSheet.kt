package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.MacroRow
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.util.toLocalizedDoubleOrNull
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import kotlin.time.Clock
import kotlin.time.Instant

/**
 * A food's or recipe's per-serving macros, scaled by the picked servings for the sheet's
 * preview. Mirrors the multiplication [AddFoodSheet] already does for its own preview.
 */
data class MealPickerMacros(
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

/** Everything [MealPickerSheet] collects, handed back to the caller on confirm. */
data class MealLogDetails(
    val mealType: String,
    val servings: Double,
    val date: String,
    val eatenAt: String?,
    val notes: String?,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MealPickerSheet(
    onDismiss: () -> Unit,
    onConfirm: (MealLogDetails) -> Unit,
    title: String = stringResource(R.string.meal_picker_log_food),
    showMealPicker: Boolean = true,
    showDateTimeNotes: Boolean = true,
    date: String = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString(),
    macros: MealPickerMacros? = null,
) {
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedMeal by remember { mutableStateOf("Lunch") }
    var servingsText by remember { mutableStateOf("1") }
    var selectedDate by remember { mutableStateOf(date) }
    val nowLocal = remember { Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()) }
    var eatenHour by remember { mutableIntStateOf(nowLocal.hour) }
    var eatenMinute by remember { mutableIntStateOf(nowLocal.minute) }
    var notes by remember { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    val servings = servingsText.toLocalizedDoubleOrNull() ?: 1.0

    if (showDatePicker) {
        val initialMillis =
            runCatching { LocalDate.parse(selectedDate).toEpochDays().toLong() * 86_400_000L }
                .getOrDefault(0L)
        val dateState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        dateState.selectedDateMillis?.let { millis ->
                            selectedDate =
                                Instant
                                    .fromEpochMilliseconds(millis)
                                    .toLocalDateTime(TimeZone.UTC)
                                    .date
                                    .toString()
                        }
                        showDatePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = dateState) }
    }

    if (showTimePicker) {
        val timeState = rememberTimePickerState(initialHour = eatenHour, initialMinute = eatenMinute)
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        eatenHour = timeState.hour
                        eatenMinute = timeState.minute
                        showTimePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
            text = {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TimePicker(state = timeState)
                }
            },
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp)
                    .imePadding()
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            if (showMealPicker) {
                Text(stringResource(R.string.meal_picker_meal_label), style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    mealTypes.forEachIndexed { index, meal ->
                        SegmentedButton(
                            selected = selectedMeal == meal,
                            onClick = { selectedMeal = meal },
                            shape = SegmentedButtonDefaults.itemShape(index, mealTypes.size),
                        ) {
                            Text(
                                mealTypeDisplayName(meal),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            }

            OutlinedTextField(
                value = servingsText,
                onValueChange = { servingsText = it },
                label = { Text(stringResource(R.string.meal_picker_servings_label)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            macros?.let {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.food_form_macros),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        MacroRow(stringResource(R.string.macro_calories), it.calories * servings, "kcal", CaloriesBlue)
                        MacroRow(stringResource(R.string.macro_protein), it.protein * servings, "g", ProteinRed)
                        MacroRow(stringResource(R.string.macro_carbs), it.carbs * servings, "g", CarbsOrange)
                        MacroRow(stringResource(R.string.macro_fat), it.fat * servings, "g", FatYellow)
                        MacroRow(stringResource(R.string.macro_fiber), it.fiber * servings, "g", FiberGreen)
                    }
                }
            }

            if (showDateTimeNotes) {
                Text(stringResource(R.string.entry_edit_date_label), style = MaterialTheme.typography.labelLarge)
                OutlinedButton(
                    onClick = { showDatePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        Icons.Default.CalendarToday,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(dayLabel(LocalDate.parse(selectedDate)))
                }

                Text(stringResource(R.string.entry_edit_time_label), style = MaterialTheme.typography.labelLarge)
                OutlinedButton(
                    onClick = { showTimePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(formatTimeOfDay(eatenHour, eatenMinute))
                }

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(stringResource(R.string.weight_notes_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                )
            }

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
                    Text(stringResource(R.string.dialog_cancel))
                }
                Button(
                    onClick = {
                        if (servings > 0) {
                            scope.launch { sheetState.hide() }.invokeOnCompletion {
                                onConfirm(
                                    MealLogDetails(
                                        mealType = selectedMeal,
                                        servings = servings,
                                        date = selectedDate,
                                        eatenAt = if (showDateTimeNotes) buildEatenAt(selectedDate, eatenHour, eatenMinute) else null,
                                        notes = if (showDateTimeNotes) notes.trim().ifBlank { null } else null,
                                    ),
                                )
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(if (showMealPicker) R.string.meal_picker_log else R.string.meal_picker_confirm))
                }
            }
        }
    }
}
