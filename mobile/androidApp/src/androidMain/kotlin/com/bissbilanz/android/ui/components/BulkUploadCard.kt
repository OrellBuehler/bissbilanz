package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.bulk.BulkUploadController
import com.bissbilanz.android.bulk.formatCount
import com.bissbilanz.foodpackage.BulkUploadCounts
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * "Syncing 12,340 / 48,000 foods": how far the background upload of a bulk-imported package has
 * come, with pause and resume and a Wi-Fi-only switch. Shows nothing when there is nothing to
 * upload or the app is in Local mode.
 */
@Composable
fun BulkUploadCard(modifier: Modifier = Modifier) {
    val controller: BulkUploadController = koinInject()
    val scope = rememberCoroutineScope()
    val counts by controller.counts.collectAsStateWithLifecycle(initialValue = BulkUploadCounts(0, 0, 0, 0))
    val paused by controller.paused.collectAsStateWithLifecycle()
    val wifiOnly by controller.wifiOnly.collectAsStateWithLifecycle()
    if (!controller.isAvailable || !counts.isActive) return
    val progress = if (counts.total > 0) counts.done.toFloat() / counts.total else 0f

    Card(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CloudUpload, contentDescription = null, modifier = Modifier.size(20.dp))
                Text(
                    stringResource(R.string.bulk_upload_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            Text(
                if (paused) {
                    stringResource(R.string.bulk_upload_paused, formatCount(counts.done), formatCount(counts.total))
                } else {
                    stringResource(R.string.bulk_upload_progress, formatCount(counts.done), formatCount(counts.total))
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            if (counts.failed > 0) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.bulk_upload_failed, formatCount(counts.failed)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { scope.launch { controller.retryFailed() } }) {
                        Text(stringResource(R.string.bulk_upload_retry), maxLines = 1)
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.bulk_upload_wifi_only),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Switch(checked = wifiOnly, onCheckedChange = { controller.setWifiOnly(it) })
            }
            OutlinedButton(
                onClick = { if (paused) controller.resume() else controller.pause() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    if (paused) Icons.Default.PlayArrow else Icons.Default.Pause,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    stringResource(if (paused) R.string.bulk_upload_resume else R.string.bulk_upload_pause),
                    maxLines = 1,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}
