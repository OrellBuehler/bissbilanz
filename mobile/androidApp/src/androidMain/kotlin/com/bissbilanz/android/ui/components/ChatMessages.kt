package com.bissbilanz.android.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatPhoto
import com.bissbilanz.android.chat.OutgoingChatMessage
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.ui.theme.LocalIsDarkTheme
import com.bissbilanz.android.util.formatIsoDateTime
import com.bissbilanz.api.generated.model.ChatMessage
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.chat.ChatBlock
import com.bissbilanz.chat.ChatPartType
import com.bissbilanz.chat.ChatProblems
import com.bissbilanz.chat.ChatRole
import com.bissbilanz.chat.ChatRunEnd
import com.bissbilanz.chat.ChatRunOutcome
import com.bissbilanz.chat.ChatSendProblem
import com.bissbilanz.chat.ChatStatus
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.Instant

/** One row of the conversation, newest first because the list is laid out from the bottom. */
sealed interface ChatRow {
    val key: String

    /** [unanswered] is how the run of a user message ended when it never got an answer. */
    data class Message(
        val message: ChatMessage,
        val unanswered: ChatRunEnd? = null,
    ) : ChatRow {
        override val key = "m-${message.id}"
    }

    data class Outgoing(
        val message: OutgoingChatMessage,
    ) : ChatRow {
        override val key = "o-${message.id}"
    }

    /** The run is working but its answer has no message yet. */
    data object Waiting : ChatRow {
        override val key = "waiting"
    }

    data object Intro : ChatRow {
        override val key = "intro"
    }
}

/** What a conversation shows, newest first; outgoing messages already in the thread are left out. */
fun chatRows(
    messages: List<ChatMessage>,
    outbox: List<OutgoingChatMessage>,
    activeRun: ChatRun?,
    unansweredRuns: Map<String, ChatRunEnd> = emptyMap(),
): List<ChatRow> {
    val known = messages.mapTo(mutableSetOf()) { it.id }
    val rows = mutableListOf<ChatRow>()
    if (messages.isEmpty() && outbox.isEmpty()) rows += ChatRow.Intro
    messages.forEach { message ->
        val unanswered = if (message.role == ChatRole.USER) message.runId?.let { unansweredRuns[it] } else null
        rows += ChatRow.Message(message, unanswered)
    }
    outbox.filter { it.id !in known }.forEach { rows += ChatRow.Outgoing(it) }
    val answering = messages.any { it.role != ChatRole.USER && it.status == ChatStatus.IN_PROGRESS }
    if (ChatStatus.isWorking(activeRun?.status) && !answering) rows += ChatRow.Waiting
    return rows.asReversed()
}

@Composable
fun ChatMessageList(
    rows: List<ChatRow>,
    listState: LazyListState,
    activeRun: ChatRun?,
    deciding: Set<String>,
    onApprove: (String) -> Unit,
    onReject: (String) -> Unit,
    onRetry: (String) -> Unit,
    onDiscard: (String) -> Unit,
    onNewChatFromRun: (String?) -> Unit,
    onNewChatWith: (String) -> Unit,
    onOpenPhoto: (List<String>, Int) -> Unit,
    onSuggestion: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Ticks so a confirmation card turns to "expired" while it is on screen.
    val now by produceState(Clock.System.now()) {
        while (true) {
            delay(15_000)
            value = Clock.System.now()
        }
    }
    LazyColumn(
        state = listState,
        reverseLayout = true,
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(Dimens.ListGap, Alignment.Bottom),
        contentPadding = PaddingValues(horizontal = Dimens.ScreenPadding, vertical = Dimens.ListGap),
    ) {
        items(rows, key = { it.key }) { row ->
            when (row) {
                is ChatRow.Message ->
                    if (row.message.role == ChatRole.USER) {
                        UserMessage(row.message, row.unanswered, onOpenPhoto) { onNewChatFromRun(row.message.runId) }
                    } else {
                        AssistantMessage(
                            message = row.message,
                            activeRun = activeRun,
                            deciding = deciding,
                            now = now,
                            onApprove = onApprove,
                            onReject = onReject,
                            onNewChat = { onNewChatFromRun(row.message.runId) },
                        )
                    }
                is ChatRow.Outgoing -> OutgoingMessage(row.message, onRetry, onDiscard) { onNewChatWith(row.message.id) }
                ChatRow.Waiting -> AssistantBubble { ThinkingRow() }
                ChatRow.Intro -> ChatIntro(onSuggestion)
            }
        }
    }
}

@Composable
private fun bubbleColors(): Pair<Color, Color> {
    val colors = MaterialTheme.colorScheme
    val tint = if (LocalIsDarkTheme.current) 0.35f else 1f
    return colors.primaryContainer.copy(alpha = tint) to colors.onPrimaryContainer
}

@Composable
private fun AssistantBubble(content: @Composable () -> Unit) {
    val (container, contentColor) = bubbleColors()
    Surface(
        color = container,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)),
        modifier = Modifier.fillMaxWidth().padding(end = 24.dp),
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(stringResource(R.string.chat_title), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
            }
            content()
        }
    }
}

@Composable
private fun UserBubble(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
            shape = MaterialTheme.shapes.medium,
            modifier = modifier.padding(start = 48.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content()
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UserMessage(
    message: ChatMessage,
    unanswered: ChatRunEnd?,
    onOpenPhoto: (List<String>, Int) -> Unit,
    onNewChat: () -> Unit,
) {
    val photos = message.parts.filter { it.type == ChatPartType.IMAGE }.mapNotNull { it.url }
    val outcome = unanswered?.let { ChatProblems.runOutcome(it.status, it.reason) }
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        UserMessageBubble(message, photos, onOpenPhoto)
        if (outcome != null) {
            Box(modifier = Modifier.padding(start = 48.dp, top = 4.dp)) { OutcomeHint(outcome, onNewChat) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UserMessageBubble(
    message: ChatMessage,
    photos: List<String>,
    onOpenPhoto: (List<String>, Int) -> Unit,
) {
    UserBubble {
        if (photos.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                photos.forEachIndexed { index, url ->
                    FoodImage(
                        imageUrl = url,
                        contentDescription = stringResource(R.string.ai_tasks_photo_index, index + 1, photos.size),
                        modifier =
                            Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onOpenPhoto(photos, index) },
                        contentScale = ContentScale.Crop,
                    )
                }
            }
        }
        val text =
            message.parts
                .filter { it.type == ChatPartType.TEXT }
                .mapNotNull { it.text }
                .joinToString("\n\n")
        if (text.isNotBlank()) {
            SelectionContainer { Text(text, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@Composable
private fun AssistantMessage(
    message: ChatMessage,
    activeRun: ChatRun?,
    deciding: Set<String>,
    now: Instant,
    onApprove: (String) -> Unit,
    onReject: (String) -> Unit,
    onNewChat: () -> Unit,
) {
    val runActive = activeRun != null && activeRun.id == message.runId
    val inProgress = message.status == ChatStatus.IN_PROGRESS
    AssistantBubble {
        message.parts.forEach { part ->
            when (part.type) {
                ChatPartType.TEXT -> part.text?.takeIf { it.isNotBlank() }?.let { SelectionContainer { MarkdownText(it) } }
                ChatPartType.TOOL -> ToolActivityRow(part, inProgress)
                ChatPartType.ACTION ->
                    ActionCard(
                        part = part,
                        awaitingThisRun = runActive && activeRun.status == ChatStatus.AWAITING_CONFIRMATION,
                        messageFinal = !inProgress,
                        busy = part.actionId in deciding,
                        now = now,
                        onApprove = onApprove,
                        onReject = onReject,
                    )
                ChatPartType.IMAGE -> part.url?.let { FoodImage(it, null, Modifier.size(72.dp).clip(RoundedCornerShape(8.dp))) }
            }
        }
        val lastIsRunningTool =
            message.parts.lastOrNull()?.let { it.type == ChatPartType.TOOL && it.status == ChatStatus.TOOL_RUNNING } == true
        if (inProgress && runActive && ChatStatus.isWorking(activeRun.status) && !lastIsRunningTool) ThinkingRow()
        if (!inProgress) {
            ChatProblems.runOutcome(message.status, message.reason)?.let { outcome ->
                OutcomeHint(outcome, onNewChat)
            }
        }
    }
}

@Composable
private fun ThinkingRow() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
    ) {
        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
        Text(stringResource(R.string.chat_thinking), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun ToolActivityRow(
    part: ChatMessagePart,
    messageInProgress: Boolean,
) {
    // A call the run stopped during can still read "running" in a finished message.
    val running = part.status == ChatStatus.TOOL_RUNNING && messageInProgress
    val failed = part.status == ChatStatus.TOOL_ERROR || (part.status == ChatStatus.TOOL_RUNNING && !messageInProgress)
    val stateLabel =
        stringResource(
            when {
                running -> R.string.chat_tool_running
                failed -> R.string.chat_tool_failed
                else -> R.string.chat_tool_done
            },
        )
    Column(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) { stateDescription = stateLabel },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                running -> CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
                failed -> Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                else -> Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(16.dp))
            }
            Text(
                part.label ?: stringResource(R.string.chat_tool_working),
                style = MaterialTheme.typography.labelMedium,
                color = LocalContentColor.current.copy(alpha = 0.8f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (failed) {
            part.summary?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(start = 24.dp),
                )
            }
        }
    }
}

/** Whether [expiresAt] has passed; an unreadable time never expires a card on its own. */
fun isExpired(
    expiresAt: String?,
    now: Instant,
): Boolean = expiresAt?.let { Instant.parseOrNull(it) }?.let { now >= it } == true

@Composable
private fun ActionCard(
    part: ChatMessagePart,
    awaitingThisRun: Boolean,
    messageFinal: Boolean,
    busy: Boolean,
    now: Instant,
    onApprove: (String) -> Unit,
    onReject: (String) -> Unit,
) {
    val actionId = part.actionId
    val pending = part.status == ChatStatus.ACTION_PENDING
    val expired = part.status == ChatStatus.ACTION_EXPIRED || (pending && isExpired(part.expiresAt, now))
    val actionable = pending && !expired && awaitingThisRun && actionId != null
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                part.label ?: stringResource(R.string.chat_action_needs_confirmation),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            part.preview?.let { preview ->
                Text(
                    preview.summary,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                preview.details.forEach { detail ->
                    Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            when {
                actionable || (pending && !expired && !messageFinal) -> {
                    part.expiresAt?.takeIf { Instant.parseOrNull(it) != null }?.let { expires ->
                        Text(
                            stringResource(R.string.chat_action_expires, formatIsoDateTime(expires)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    SheetActionRow(modifier = Modifier.padding(top = 4.dp)) {
                        OutlinedButton(
                            onClick = { actionId?.let(onReject) },
                            enabled = actionable && !busy,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        ) { Text(stringResource(R.string.chat_action_reject), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        Button(
                            onClick = { actionId?.let(onApprove) },
                            enabled = actionable && !busy,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        ) {
                            if (busy) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = LocalContentColor.current,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text(stringResource(R.string.chat_action_approve), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                else -> ActionState(part.status, expired)
            }
        }
    }
}

@Composable
private fun ActionState(
    status: String?,
    expired: Boolean,
) {
    val (icon, label, tint) =
        when {
            status == ChatStatus.ACTION_APPROVED ->
                Triple(
                    Icons.Default.CheckCircle,
                    R.string.chat_action_approved,
                    MaterialTheme.colorScheme.tertiary,
                )
            status == ChatStatus.ACTION_REJECTED ->
                Triple(
                    Icons.Default.Block,
                    R.string.chat_action_rejected,
                    MaterialTheme.colorScheme.onSurfaceVariant,
                )
            expired -> Triple(Icons.Default.Schedule, R.string.chat_action_expired_state, MaterialTheme.colorScheme.onSurfaceVariant)
            status == ChatStatus.ACTION_CANCELLED || status == ChatStatus.ACTION_PENDING ->
                Triple(Icons.Default.Block, R.string.chat_action_not_done, MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Triple(Icons.Default.Info, R.string.chat_action_closed, MaterialTheme.colorScheme.onSurfaceVariant)
        }
    StatusLine(icon, stringResource(label), tint)
}

@Composable
private fun StatusLine(
    icon: ImageVector,
    text: String,
    tint: Color,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.semantics(mergeDescendants = true) {},
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = tint, modifier = Modifier.weight(1f, fill = false))
    }
}

@Composable
private fun OutcomeHint(
    outcome: ChatRunOutcome,
    onNewChat: () -> Unit,
) {
    val tint =
        if (outcome == ChatRunOutcome.STOPPED || outcome == ChatRunOutcome.CUT_OFF || outcome == ChatRunOutcome.STEP_LIMIT) {
            LocalContentColor.current.copy(alpha = 0.8f)
        } else {
            MaterialTheme.colorScheme.error
        }
    Column {
        StatusLine(
            if (tint ==
                MaterialTheme.colorScheme.error
            ) {
                Icons.Default.Warning
            } else {
                Icons.Default.Info
            },
            stringResource(outcome.message()),
            tint,
        )
        if (outcome == ChatRunOutcome.CONVERSATION_TOO_LONG) NewChatButton(onNewChat)
    }
}

@Composable
private fun NewChatButton(onNewChat: () -> Unit) {
    TextButton(onClick = onNewChat, contentPadding = PaddingValues(horizontal = 0.dp)) {
        Text(stringResource(R.string.chat_new), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OutgoingMessage(
    message: OutgoingChatMessage,
    onRetry: (String) -> Unit,
    onDiscard: (String) -> Unit,
    onNewChat: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        UserBubble {
            if (message.photos.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    message.photos.forEach { LocalPhotoThumb(it, size = 72) }
                }
            }
            Text(message.text, style = MaterialTheme.typography.bodyMedium)
        }
        val problem = message.problem
        if (message.sending || problem == null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(top = 4.dp).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
            ) {
                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 2.dp)
                Text(
                    stringResource(R.string.chat_sending),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Column(
                horizontalAlignment = Alignment.End,
                modifier =
                    Modifier.padding(start = 48.dp, top = 4.dp).semantics(mergeDescendants = true) {
                        liveRegion =
                            LiveRegionMode.Polite
                    },
            ) {
                Text(
                    stringResource(problem.message()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                message.retryAfterSeconds?.let { seconds ->
                    if (problem == ChatSendProblem.DAILY_LIMIT || problem == ChatSendProblem.RATE_LIMITED) {
                        Text(
                            retryAfterText(seconds),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (problem == ChatSendProblem.CONVERSATION_TOO_LONG) NewChatButton(onNewChat)
                TextButton(onClick = { onDiscard(message.id) }) { Text(stringResource(R.string.action_discard), maxLines = 1) }
                if (problem.retryable()) {
                    TextButton(onClick = { onRetry(message.id) }) { Text(stringResource(R.string.action_retry), maxLines = 1) }
                }
            }
        }
    }
}

@Composable
fun LocalPhotoThumb(
    photo: ChatPhoto,
    size: Int,
    modifier: Modifier = Modifier,
) {
    AsyncImage(
        model = photo.jpeg,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.size(size.dp).clip(RoundedCornerShape(8.dp)),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatIntro(onSuggestion: (String) -> Unit) {
    val suggestions =
        listOf(
            stringResource(R.string.chat_suggestion_today),
            stringResource(R.string.chat_suggestion_protein),
            stringResource(R.string.chat_suggestion_dinner),
            stringResource(R.string.chat_suggestion_log),
        )
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Default.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(36.dp),
        )
        Text(
            stringResource(R.string.chat_empty_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.chat_empty_text),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            suggestions.forEach { suggestion ->
                SuggestionChip(onClick = { onSuggestion(suggestion) }, label = { Text(suggestion) })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChatPrivacyNotice(
    onSeen: () -> Unit,
    onPrivacyPolicy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                stringResource(R.string.chat_privacy_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.chat_privacy_text), style = MaterialTheme.typography.bodySmall)
            // "Datenschutzerklärung" does not fit half a row in German, so the link is a
            // text button that wraps above the acknowledgement when the row is too narrow.
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                itemVerticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(onClick = onPrivacyPolicy) { Text(stringResource(R.string.settings_privacy_policy), maxLines = 1) }
                Button(onClick = onSeen) { Text(stringResource(R.string.chat_privacy_ok), maxLines = 1) }
            }
        }
    }
}

/** Problems a resend with the same id can fix; the others need a new chat or a changed message. */
fun ChatSendProblem.retryable(): Boolean =
    this != ChatSendProblem.CONVERSATION_TOO_LONG &&
        this != ChatSendProblem.CONVERSATION_GONE &&
        this != ChatSendProblem.INVALID &&
        this != ChatSendProblem.INVALID_IMAGE &&
        this != ChatSendProblem.UPLOAD_QUOTA

@StringRes
fun ChatSendProblem.message(): Int =
    when (this) {
        ChatSendProblem.OFFLINE -> R.string.chat_problem_offline
        ChatSendProblem.NETWORK -> R.string.chat_problem_network
        ChatSendProblem.SIGNED_OUT -> R.string.chat_problem_signed_out
        ChatSendProblem.UNAVAILABLE -> R.string.chat_problem_unavailable
        ChatSendProblem.BUDGET_EXHAUSTED -> R.string.chat_problem_budget
        ChatSendProblem.DAILY_LIMIT -> R.string.chat_problem_daily_limit
        ChatSendProblem.RATE_LIMITED -> R.string.chat_problem_rate_limited
        ChatSendProblem.CONVERSATION_TOO_LONG -> R.string.chat_problem_too_long
        ChatSendProblem.RUN_ACTIVE -> R.string.chat_problem_run_active
        ChatSendProblem.MESSAGE_ID_CONFLICT -> R.string.chat_problem_unknown
        ChatSendProblem.UPLOAD_QUOTA -> R.string.chat_problem_upload_quota
        ChatSendProblem.INVALID_IMAGE -> R.string.chat_problem_invalid_image
        ChatSendProblem.INVALID -> R.string.chat_problem_invalid
        ChatSendProblem.CONVERSATION_GONE -> R.string.chat_problem_gone
        ChatSendProblem.UNKNOWN -> R.string.chat_problem_unknown
    }

@StringRes
fun ChatBlock.message(): Int =
    when (this) {
        ChatBlock.NOT_CONFIGURED -> R.string.chat_blocked_not_configured
        ChatBlock.DISABLED -> R.string.chat_blocked_disabled
        ChatBlock.NO_ACCESS -> R.string.chat_blocked_no_access
        ChatBlock.USER_BUDGET -> R.string.chat_blocked_user_budget
        ChatBlock.GLOBAL_BUDGET -> R.string.chat_blocked_global_budget
        ChatBlock.OTHER -> R.string.chat_blocked_other
    }

@StringRes
fun ChatRunOutcome.message(): Int =
    when (this) {
        ChatRunOutcome.CUT_OFF -> R.string.chat_outcome_cut_off
        ChatRunOutcome.STEP_LIMIT -> R.string.chat_outcome_step_limit
        ChatRunOutcome.INCOMPLETE -> R.string.chat_outcome_incomplete
        ChatRunOutcome.UNAVAILABLE -> R.string.chat_outcome_unavailable
        ChatRunOutcome.BUDGET_EXHAUSTED -> R.string.chat_outcome_budget
        ChatRunOutcome.REFUSAL -> R.string.chat_outcome_refusal
        ChatRunOutcome.CONVERSATION_TOO_LONG -> R.string.chat_outcome_too_long
        ChatRunOutcome.ERROR -> R.string.chat_outcome_error
        ChatRunOutcome.STOPPED -> R.string.chat_outcome_stopped
        ChatRunOutcome.CONFIRMATION_EXPIRED -> R.string.chat_outcome_expired
        ChatRunOutcome.INTERRUPTED -> R.string.chat_outcome_interrupted
    }
