package com.bissbilanz.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.LocalIsDarkTheme
import com.bissbilanz.android.ui.viewmodels.ReplyDraft
import com.bissbilanz.android.ui.viewmodels.message
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.util.AI_TASK_REPLY_MAX_CHARS
import com.bissbilanz.util.CorrectionState
import com.bissbilanz.util.ReplyAuthor
import com.bissbilanz.util.ReplyBlock
import com.bissbilanz.util.ReplyOutcome
import com.bissbilanz.util.author
import com.bissbilanz.util.correction
import com.bissbilanz.util.isInProgress
import com.bissbilanz.util.replyBlock
import com.bissbilanz.util.replyOutcome

@Composable
fun AiTaskThread(
    thread: AiTaskClaudeThread,
    draft: ReplyDraft,
    newReplyIds: Set<String>,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val correction = thread.correction()
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        thread.messages.forEach { message ->
            ThreadMessage(message = message, isNew = message.unread || message.id in newReplyIds)
        }
        when {
            correction.isInProgress() -> CorrectionInProgress(retrying = correction == CorrectionState.RETRYING)
            thread.canReply -> ReplyComposer(draft = draft, onTextChange = onTextChange, onSend = onSend)
            else -> {
                Text(
                    stringResource((thread.replyBlock() ?: ReplyBlock.OTHER).message()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                RetryHint(draft)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ThreadMessage(
    message: AiTaskThreadMessage,
    isNew: Boolean,
) {
    val colors = MaterialTheme.colorScheme
    val fromUser = message.author() == ReplyAuthor.USER
    val outcome = message.replyOutcome()
    val failed = outcome == ReplyOutcome.FAILED
    val tint = if (LocalIsDarkTheme.current) 0.35f else 1f
    val container =
        when {
            fromUser -> colors.surfaceContainerLowest
            failed -> colors.errorContainer.copy(alpha = tint)
            else -> colors.primaryContainer.copy(alpha = tint)
        }
    val content =
        when {
            fromUser -> colors.onSurface
            failed -> colors.onErrorContainer
            else -> colors.onPrimaryContainer
        }
    Surface(
        color = container,
        contentColor = content,
        shape = MaterialTheme.shapes.small,
        border = if (fromUser) null else BorderStroke(1.dp, (if (failed) colors.error else colors.primary).copy(alpha = 0.3f)),
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(start = if (fromUser) 32.dp else 0.dp, end = if (fromUser) 0.dp else 32.dp)
                .semantics(mergeDescendants = true) {},
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                if (fromUser) {
                    Text(
                        stringResource(R.string.ai_tasks_reply_you),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = colors.onSurfaceVariant,
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(12.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            stringResource(R.string.ai_tasks_reply_claude),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    when (outcome) {
                        ReplyOutcome.CHANGED ->
                            OutcomeLabel(Icons.Default.CheckCircle, stringResource(R.string.ai_tasks_reply_changed), colors.tertiary)
                        ReplyOutcome.FAILED ->
                            OutcomeLabel(Icons.Default.Warning, stringResource(R.string.ai_tasks_reply_failed), colors.error)
                        else -> {}
                    }
                    if (isNew) Badge { Text(stringResource(R.string.ai_tasks_unread)) }
                }
            }
            Text(message.text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun OutcomeLabel(
    icon: ImageVector,
    label: String,
    tint: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(12.dp))
        Spacer(modifier = Modifier.width(2.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tint, maxLines = 1)
    }
}

@Composable
private fun CorrectionInProgress(retrying: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
    ) {
        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
        Text(
            stringResource(if (retrying) R.string.ai_tasks_reply_retrying else R.string.ai_tasks_reply_working),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ReplyComposer(
    draft: ReplyDraft,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val length = draft.text.trim().length
    val tooLong = length > AI_TASK_REPLY_MAX_CHARS
    OutlinedTextField(
        value = draft.text,
        onValueChange = onTextChange,
        readOnly = draft.sending,
        label = { Text(stringResource(R.string.ai_tasks_reply_label)) },
        placeholder = { Text(stringResource(R.string.ai_tasks_reply_placeholder)) },
        isError = tooLong,
        supportingText = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (tooLong) stringResource(R.string.ai_tasks_reply_too_long, AI_TASK_REPLY_MAX_CHARS) else "",
                    modifier = Modifier.weight(1f),
                )
                Text(stringResource(R.string.ai_tasks_reply_counter, length, AI_TASK_REPLY_MAX_CHARS), maxLines = 1)
            }
        },
        minLines = 2,
        maxLines = 6,
        textStyle = MaterialTheme.typography.bodyMedium,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = Modifier.fillMaxWidth(),
    )
    draft.failure?.let { failure ->
        Text(
            stringResource(failure.message),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
    RetryHint(draft)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(R.string.ai_tasks_reply_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Button(onClick = onSend, enabled = draft.canSend) {
            if (draft.sending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = LocalContentColor.current,
                )
            } else {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                stringResource(if (draft.sending) R.string.ai_tasks_reply_sending else R.string.ai_tasks_reply_send),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RetryHint(draft: ReplyDraft) {
    val seconds = draft.retryAfterSeconds?.takeIf { draft.waiting } ?: return
    Text(
        retryAfterText(seconds),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun retryAfterText(seconds: Long): String =
    when {
        seconds < 60 -> stringResource(R.string.ai_tasks_reply_retry_soon)
        seconds < 3600 -> {
            val minutes = ((seconds + 59) / 60).toInt()
            pluralStringResource(R.plurals.ai_tasks_reply_retry_minutes, minutes, minutes)
        }
        else -> {
            val hours = ((seconds + 3599) / 3600).toInt()
            pluralStringResource(R.plurals.ai_tasks_reply_retry_hours, hours, hours)
        }
    }
