package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.sync.SyncManager
import org.koin.compose.koinInject

/**
 * Surfaces offline edits that lost last-write-wins, or that targeted a record deleted
 * on another device. The sync manager records these while draining; before this banner
 * existed nothing read them, so the resolution was silent and the user never learned
 * their change had been dropped. Mirrors the web PWA's SyncConflictBanner.
 *
 * The notice text itself comes from the shared sync manager in English, matching how
 * the Pending Sync screen already reports sync errors.
 */
@Composable
fun SyncConflictBanner(modifier: Modifier = Modifier) {
    val syncManager: SyncManager = koinInject()
    val syncState by syncManager.state.collectAsStateWithLifecycle()
    val notices = syncState.conflictNotices
    if (notices.isEmpty()) return

    Surface(
        // Sits in the app shell's topBar slot, which the shell leaves inset-free
        // so screens can draw under the status bar; when the banner is showing it
        // takes that inset itself.
        modifier = modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars),
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(start = 12.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Outlined.Info,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    pluralStringResource(R.plurals.sync_conflict_banner, notices.size, notices.size),
                    style = MaterialTheme.typography.labelMedium,
                )
                Text(
                    notices.first(),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = { syncManager.clearConflictNotices() }) {
                Text(stringResource(R.string.sync_conflict_dismiss))
            }
        }
    }
}
