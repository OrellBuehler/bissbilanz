package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.util.shareFile
import com.bissbilanz.android.ui.viewmodels.FoodPackageViewModel
import com.bissbilanz.android.ui.viewmodels.FoodPackageViewModel.ExportMode

/**
 * Export foods and recipes as a shareable package, mirroring the web's
 * FoodPackageExportDialog. Call [FoodPackageViewModel.startExport] before
 * showing it.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FoodPackageExportSheet(
    viewModel: FoodPackageViewModel,
    onDismiss: () -> Unit,
) {
    val state by viewModel.exportState.collectAsStateWithLifecycle()
    val exportedFile by viewModel.exportedFile.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(exportedFile) {
        exportedFile?.let { file ->
            shareFile(context, file, "application/zip")
            viewModel.clearExportedFile()
            onDismiss()
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.food_package_export_title), style = MaterialTheme.typography.titleLarge)
            Text(
                stringResource(R.string.food_package_export_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            val modes =
                buildList {
                    add(ExportMode.ALL)
                    if (!state.recipesOnly) add(ExportMode.FILTER)
                    if (state.hasSelection) add(ExportMode.SELECTED)
                }
            if (modes.size > 1) {
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    modes.forEachIndexed { index, mode ->
                        SegmentedButton(
                            selected = state.mode == mode,
                            onClick = { viewModel.setMode(mode) },
                            shape = SegmentedButtonDefaults.itemShape(index, modes.size),
                        ) {
                            Text(
                                when (mode) {
                                    ExportMode.ALL -> stringResource(R.string.food_package_mode_all)
                                    ExportMode.FILTER -> stringResource(R.string.food_package_mode_filter)
                                    ExportMode.SELECTED ->
                                        stringResource(
                                            R.string.food_package_mode_selected,
                                            state.foodIds.size + state.recipeIds.size,
                                        )
                                },
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            if (state.mode == ExportMode.FILTER) {
                Text(
                    stringResource(R.string.food_package_filter_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FacetChips(
                    title = stringResource(R.string.food_package_brands),
                    options = state.brandOptions.map { it.brand to it.count },
                    selected = state.brands,
                    onToggle = viewModel::toggleBrand,
                )
                FacetChips(
                    title = stringResource(R.string.food_package_labels),
                    options = state.labelOptions.map { it.label to it.count },
                    selected = state.labels,
                    onToggle = viewModel::toggleLabel,
                )
            }

            if (!state.recipesOnly && !(state.mode == ExportMode.SELECTED && state.foodIds.isEmpty())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (state.mode == ExportMode.ALL) {
                            stringResource(R.string.food_package_include_recipes)
                        } else {
                            stringResource(R.string.food_package_include_related_recipes)
                        },
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = state.includeRecipes, onCheckedChange = viewModel::setIncludeRecipes)
                }
            }

            val summary = state.summary
            Column(modifier = Modifier.heightIn(min = 40.dp)) {
                when {
                    state.loadingSummary && summary == null ->
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    summary == null || summary.foods + summary.recipes == 0 ->
                        Text(
                            stringResource(R.string.food_package_nothing_selected),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    else -> {
                        Text(
                            stringResource(
                                R.string.food_package_summary,
                                summary.foods,
                                summary.recipes,
                                summary.images,
                                formatBytes(summary.estimatedBytes.toLong()),
                            ),
                            fontWeight = FontWeight.Medium,
                        )
                        if (summary.ingredientFoods > 0) {
                            Text(
                                stringResource(R.string.food_package_ingredients_added, summary.ingredientFoods),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (summary.overLimit) {
                            Text(
                                stringResource(R.string.food_package_too_large),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }

            Button(
                onClick = { viewModel.exportPackage(context.cacheDir) },
                enabled =
                    !state.exporting &&
                        summary != null &&
                        summary.foods + summary.recipes > 0 &&
                        !summary.overLimit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.exporting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.food_package_export_button))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FacetChips(
    title: String,
    options: List<Pair<String, Int>>,
    selected: Set<String>,
    onToggle: (String) -> Unit,
) {
    Text(title, style = MaterialTheme.typography.titleSmall)
    if (options.isEmpty()) {
        Text(
            stringResource(R.string.food_package_filter_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, count) ->
            val isSelected = value in selected
            FilterChip(
                selected = isSelected,
                onClick = { onToggle(value) },
                label = { Text("$value  $count", maxLines = 1) },
                leadingIcon =
                    if (isSelected) {
                        { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    } else {
                        null
                    },
            )
        }
    }
}

internal fun formatBytes(bytes: Long): String =
    if (bytes < 1024 * 1024) {
        "${maxOf(1, bytes / 1024)} KB"
    } else {
        String.format(java.util.Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024.0)
    }
