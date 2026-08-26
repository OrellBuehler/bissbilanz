package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.android.ui.screens.formatElapsed
import com.bissbilanz.android.ui.theme.FastingIndigo
import com.bissbilanz.android.ui.theme.macroTextTone
import kotlinx.coroutines.delay
import kotlinx.datetime.Clock
import org.koin.compose.koinInject

/**
 * Entry point to the fasting tracker on the dashboard. Only rendered for today —
 * a fast is a "now" concept, not tied to the browsed date — and shows the live
 * elapsed timer while one is running, matching iOS.
 */
@Composable
fun FastingCard(onClick: () -> Unit) {
    val fastingManager: FastingManager = koinInject()
    val session by fastingManager.session.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { fastingManager.refresh() }

    var now by remember { mutableStateOf(Clock.System.now()) }
    LaunchedEffect(session?.id) {
        while (session != null) {
            now = Clock.System.now()
            delay(1000)
        }
    }

    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Default.Timer,
                contentDescription = null,
                tint = FastingIndigo.macroTextTone(),
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.fasting_title),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    session?.let { formatElapsed(it.elapsed(now)) }
                        ?: stringResource(R.string.fasting_card_start),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            session?.let {
                Text(
                    stringResource(R.string.fasting_target_hours, it.targetHours),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
