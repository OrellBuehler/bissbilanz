package com.bissbilanz.android.ui.screens

import android.content.ClipData
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.BuildConfig
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.McpConnectionStore
import com.bissbilanz.android.util.AssistantLinks
import com.bissbilanz.android.util.QrCodeImage
import com.bissbilanz.api.BissbilanzApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectAssistantScreen(navController: NavController) {
    val clipboard = LocalClipboard.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val copiedMessage = stringResource(R.string.connect_assistant_copied)
    val api: BissbilanzApi = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val connectionStore: McpConnectionStore = koinInject()
    val connection by connectionStore.state.collectAsStateWithLifecycle()

    val serverUrl = AssistantLinks.serverUrl(BuildConfig.BASE_URL)
    val claudeInstallLink = AssistantLinks.claudeInstallLink(BuildConfig.BASE_URL)
    val claudeCodeCommand = "claude mcp add --transport http bissbilanz $serverUrl"

    fun copyToClipboard(text: String) {
        scope.launch {
            clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("", text)))
            snackbarHostState.showSnackbar(copiedMessage)
        }
    }

    // Also runs when coming back from the browser or Claude after connecting.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            try {
                connectionStore.refresh { api.getMcpConnection() }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.connect_assistant_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.connect_assistant_intro),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            ConnectionStatusCard(connected = connection.connected, clientNames = connection.clientNames)

            SectionCard(title = stringResource(R.string.connect_assistant_claude_title)) {
                Text(
                    stringResource(R.string.connect_assistant_claude_body),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(12.dp))
                OpenLinkButton(
                    label = stringResource(R.string.connect_assistant_claude_connect),
                    onClick = { uriHandler.openUri(claudeInstallLink) },
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    stringResource(R.string.connect_assistant_claude_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            SectionCard(title = stringResource(R.string.connect_assistant_chatgpt_title)) {
                Text(
                    stringResource(R.string.connect_assistant_chatgpt_requirements),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(12.dp))
                NumberedStep(1, stringResource(R.string.connect_assistant_chatgpt_step_1))
                NumberedStep(2, stringResource(R.string.connect_assistant_chatgpt_step_2))
                NumberedStep(3, stringResource(R.string.connect_assistant_chatgpt_step_3))
                NumberedStep(4, stringResource(R.string.connect_assistant_chatgpt_step_4))
                NumberedStep(5, stringResource(R.string.connect_assistant_chatgpt_step_5))
                Spacer(modifier = Modifier.height(4.dp))
                OpenLinkButton(
                    label = stringResource(R.string.connect_assistant_chatgpt_open),
                    onClick = { uriHandler.openUri(AssistantLinks.CHATGPT_PLUGINS_URL) },
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { copyToClipboard(serverUrl) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.connect_assistant_copy_url),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    stringResource(R.string.connect_assistant_chatgpt_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            SectionCard(title = stringResource(R.string.connect_assistant_gemini_title)) {
                Text(
                    stringResource(R.string.connect_assistant_gemini_body),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            SectionCard(title = stringResource(R.string.connect_assistant_desktop_title)) {
                Text(
                    stringResource(R.string.connect_assistant_desktop_body),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    QrCodeImage(
                        content = claudeInstallLink,
                        description = stringResource(R.string.connect_assistant_qr_description),
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    stringResource(R.string.connect_assistant_server_url_title),
                    style = MaterialTheme.typography.labelLarge,
                )
                CopyableCode(
                    text = serverUrl,
                    copyLabel = stringResource(R.string.connect_assistant_copy_server_url),
                    onCopy = { copyToClipboard(serverUrl) },
                )
            }

            CollapsibleSection(title = stringResource(R.string.connect_assistant_advanced_title)) {
                Text(
                    stringResource(R.string.connect_assistant_claude_code_title),
                    style = MaterialTheme.typography.labelLarge,
                )
                CopyableCode(
                    text = claudeCodeCommand,
                    copyLabel = stringResource(R.string.connect_assistant_copy_command),
                    onCopy = { copyToClipboard(claudeCodeCommand) },
                )
                Text(
                    stringResource(R.string.connect_assistant_claude_code_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    stringResource(R.string.connect_assistant_other_clients_title),
                    style = MaterialTheme.typography.labelLarge,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    stringResource(R.string.connect_assistant_other_clients_body),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ConnectionStatusCard(
    connected: Boolean,
    clientNames: List<String>,
) {
    val text =
        when {
            connected && clientNames.isNotEmpty() ->
                stringResource(R.string.connect_assistant_status_connected_clients, clientNames.joinToString(", "))
            connected -> stringResource(R.string.connect_assistant_status_connected)
            else -> stringResource(R.string.connect_assistant_status_not_connected)
        }
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                if (connected) Icons.Default.CheckCircle else Icons.Default.LinkOff,
                contentDescription = null,
                tint =
                    if (connected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
            )
            Text(
                text,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun CollapsibleSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button) { expanded = !expanded }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription =
                        stringResource(if (expanded) R.string.food_detail_collapse else R.string.food_detail_expand),
                    modifier = Modifier.rotate(if (expanded) 180f else 0f),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
private fun OpenLinkButton(
    label: String,
    onClick: () -> Unit,
) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(modifier = Modifier.width(8.dp))
        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun CopyableCode(
    text: String,
    copyLabel: String,
    onCopy: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onCopy) {
            Icon(Icons.Default.ContentCopy, copyLabel)
        }
    }
}

@Composable
private fun NumberedStep(
    number: Int,
    text: String,
) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Box(
            modifier =
                Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "$number",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
    }
}
