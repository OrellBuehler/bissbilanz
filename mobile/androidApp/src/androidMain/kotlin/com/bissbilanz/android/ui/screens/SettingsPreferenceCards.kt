package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.android.ui.components.CheckboxRow
import com.bissbilanz.android.ui.components.ChoiceDropdown
import com.bissbilanz.android.ui.components.ToggleRow
import com.bissbilanz.model.MealType
import com.bissbilanz.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate as GenPreferencesUpdate

/**
 * AI task processor: who resolves the meal-logging tasks queued from the AI meal sheet,
 * the MCP assistant or the user's own iPhone running Foundation Models on-device (or
 * Private Cloud Compute). Only the assistant can be chosen here; see the dropdown below.
 */
@Composable
internal fun AiTaskProcessorCard(
    prefs: Preferences?,
    onProcessorChange: (GenPreferencesUpdate.AiTaskProcessor) -> Unit,
    onAutoLogChange: (Boolean) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_ai_task_processor_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_ai_task_processor_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            // The device processor is iPhone-only, so Android never offers it. An account
            // that already has it set still lists it, so the stored value stays visible
            // and is only replaced by an explicit pick of the assistant.
            val deviceSelected = prefs?.aiTaskProcessor?.value == GenPreferencesUpdate.AiTaskProcessor.device.value
            val assistantOption =
                stringResource(R.string.settings_ai_task_processor_assistant) to
                    GenPreferencesUpdate.AiTaskProcessor.assistant
            val deviceOption =
                stringResource(R.string.settings_ai_task_processor_device) to
                    GenPreferencesUpdate.AiTaskProcessor.device
            val processorOptions =
                if (deviceSelected) listOf(assistantOption, deviceOption) else listOf(assistantOption)
            ChoiceDropdown(
                selectedLabel = if (deviceSelected) deviceOption.first else assistantOption.first,
                options = processorOptions,
                onSelect = { if (it.value != prefs?.aiTaskProcessor?.value) onProcessorChange(it) },
            )
            if (deviceSelected) {
                Spacer(modifier = Modifier.height(8.dp))
                // The server cannot tell whether this account has an iPhone, so
                // this hint carries the warning that tasks wait for that app.
                Text(
                    stringResource(R.string.settings_ai_task_processor_device_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(8.dp))
                ToggleRow(
                    label = stringResource(R.string.settings_ai_task_auto_log_label),
                    supportingText = stringResource(R.string.settings_ai_task_auto_log_hint),
                    checked = prefs?.aiTaskAutoLog ?: false,
                    onCheckedChange = { onAutoLogChange(it) },
                )
            }
        }
    }
}

@Composable
internal fun CustomMealTypesCard(
    customMealTypes: List<MealType>,
    onAddClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.settings_custom_meal_types),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                IconButton(onClick = { onAddClick() }) {
                    Icon(Icons.Default.Add, stringResource(R.string.settings_add_meal_type))
                }
            }
            if (customMealTypes.isEmpty()) {
                Text(
                    stringResource(R.string.settings_default_meals_only),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                customMealTypes.forEach { mealType ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(mealType.name)
                    }
                }
            }
        }
    }
}

@Composable
internal fun FavoriteLoggingCard(
    mode: String,
    onModeChange: (GenPreferencesUpdate.FavoriteMealAssignmentMode) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_favorite_logging),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(
                    selected = mode == "time_based",
                    onClick = {
                        onModeChange(GenPreferencesUpdate.FavoriteMealAssignmentMode.time_based)
                    },
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.settings_auto_assign_by_time))
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(
                    selected = mode == "ask_meal",
                    onClick = {
                        onModeChange(GenPreferencesUpdate.FavoriteMealAssignmentMode.ask_meal)
                    },
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.settings_always_ask))
            }
        }
    }
}

@Composable
internal fun VisibleNutrientsCard(
    selected: Set<String>?,
    dirty: Boolean,
    onSelectionChange: (Set<String>) -> Unit,
    onSave: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_visible_nutrients),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_visible_nutrients_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        onSelectionChange(ALL_NUTRIENT_KEYS.toSet())
                    },
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.settings_select_all)) }
                OutlinedButton(
                    onClick = {
                        onSelectionChange(emptySet())
                    },
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.settings_deselect_all)) }
            }
            Spacer(modifier = Modifier.height(8.dp))
            selected?.let { selected ->
                nutrientCategories().forEach { (category, nutrients) ->
                    Text(
                        category,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                    )
                    nutrients.forEach { (key, label) ->
                        CheckboxRow(
                            label = label,
                            checked = key in selected,
                            onCheckedChange = { checked ->
                                onSelectionChange(if (checked) selected + key else selected - key)
                            },
                        )
                    }
                }
            }
            if (dirty) {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = {
                        onSave()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.weight_save)) }
            }
        }
    }
}

/**
 * In-app language override, the Android counterpart of the iOS English/Deutsch picker.
 *
 * Device-local, not a server preference: which language the phone speaks is a property of
 * the phone. On API 33+ the choice is handed to the platform's per-app language and also
 * appears in Android's own app settings; below that it is stored locally and applied by
 * rebuilding the activity, which is why picking a language restarts this screen there.
 */
@Composable
internal fun LanguageCard() {
    val context = LocalContext.current
    var selected by remember { mutableStateOf(AppLanguage.stored(context)) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                stringResource(R.string.settings_language),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            val options =
                listOf(
                    AppLanguage.SYSTEM to stringResource(R.string.settings_language_system),
                    "en" to stringResource(R.string.settings_language_english),
                    "de" to stringResource(R.string.settings_language_german),
                )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                options.forEachIndexed { index, (tag, label) ->
                    SegmentedButton(
                        shape = SegmentedButtonDefaults.itemShape(index, options.size),
                        onClick = {
                            if (tag == selected) return@SegmentedButton
                            selected = tag
                            AppLanguage.applyAndRefresh(context, tag)
                        },
                        selected = selected == tag,
                    ) {
                        Text(label)
                    }
                }
            }
        }
    }
}
