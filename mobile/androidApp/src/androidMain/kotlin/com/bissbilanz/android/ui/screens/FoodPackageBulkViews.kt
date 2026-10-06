package com.bissbilanz.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.FileOpen
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.bulk.BulkImportStatus
import com.bissbilanz.android.bulk.formatCount
import com.bissbilanz.android.ui.theme.MacroColors
import com.bissbilanz.android.ui.viewmodels.FoodPackageViewModel
import com.bissbilanz.foodpackage.BulkImportSummary

/** A package too big for the per-item review: what is in it, and one button to bring it all in. */
@Composable
internal fun BulkReadyView(
    viewModel: FoodPackageViewModel,
    state: FoodPackageViewModel.ImportState,
    isLocalMode: Boolean,
    onPickAnother: () -> Unit,
) {
    val info = state.bulk ?: return
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                state.fileName?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    stringResource(R.string.bulk_import_ready_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(stringResource(R.string.bulk_import_ready_foods, formatCount(info.foodCount)), fontWeight = FontWeight.Medium)
                if (info.recipeCount > 0) {
                    SmallText(stringResource(R.string.bulk_import_ready_recipes, formatCount(info.recipeCount)))
                }
                SmallText(stringResource(R.string.bulk_import_ready_hint))
                if (!isLocalMode) SmallText(stringResource(R.string.bulk_import_ready_upload_hint))
            }
        }
        Button(
            onClick = { viewModel.startBulkImport() },
            enabled = !state.importing,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.importing) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text(stringResource(R.string.bulk_import_button, formatCount(info.foodCount)), maxLines = 1)
            }
        }
        OutlinedButton(onClick = onPickAnother, enabled = !state.importing, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.FileOpen, null, modifier = Modifier.size(18.dp))
            Text(stringResource(R.string.food_package_choose_file), maxLines = 1, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
internal fun BulkRunningView(status: BulkImportStatus.Running) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.bulk_import_running_title), style = MaterialTheme.typography.titleMedium)
        if (status.total > 0) {
            LinearProgressIndicator(
                progress = { status.processed.toFloat() / status.total },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(stringResource(R.string.bulk_import_progress, formatCount(status.processed), formatCount(status.total)))
        } else {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        SmallText(stringResource(R.string.bulk_import_running_hint))
    }
}

@Composable
internal fun BulkFinishedView(
    summary: BulkImportSummary,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CheckCircle, null, tint = MacroColors.current.fiber)
            Text(
                stringResource(R.string.bulk_import_result_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Text(
            stringResource(
                R.string.bulk_import_result_foods,
                formatCount(summary.created),
                formatCount(summary.skippedExisting),
                formatCount(summary.invalid),
            ),
        )
        SmallText(stringResource(R.string.bulk_import_result_images, formatCount(summary.images)))
        if (summary.imagesMissing >
            0
        ) {
            SmallText(stringResource(R.string.bulk_import_result_images_missing, formatCount(summary.imagesMissing)))
        }
        if (summary.recipesSkipped > 0) SmallText(stringResource(R.string.bulk_import_result_recipes, formatCount(summary.recipesSkipped)))
        if (summary.queuedForUpload > 0) SmallText(stringResource(R.string.bulk_import_result_upload, formatCount(summary.queuedForUpload)))
        Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.food_package_done))
        }
    }
}

@Composable
internal fun BulkFailedView(
    messageRes: Int,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(messageRes), color = MaterialTheme.colorScheme.error)
        Button(onClick = onDone) {
            Text(stringResource(R.string.food_package_done))
        }
    }
}
