package com.bissbilanz.util

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.api.generated.model.AiTaskThreadMessage

const val AI_TASK_REPLY_MAX_CHARS = 1000

const val AI_TASK_ACKNOWLEDGE_MAX_IDS = 100

enum class CorrectionState { IDLE, QUEUED, RUNNING, RETRYING, FAILED, UNKNOWN }

fun AiTaskClaudeThread.correction(): CorrectionState =
    when (correctionState) {
        "idle" -> CorrectionState.IDLE
        "queued" -> CorrectionState.QUEUED
        "running" -> CorrectionState.RUNNING
        "retrying" -> CorrectionState.RETRYING
        "failed" -> CorrectionState.FAILED
        else -> CorrectionState.UNKNOWN
    }

fun CorrectionState.isInProgress(): Boolean = this != CorrectionState.IDLE && this != CorrectionState.FAILED

fun CorrectionState.isPolled(): Boolean =
    this == CorrectionState.QUEUED || this == CorrectionState.RUNNING || this == CorrectionState.RETRYING

enum class ReplyAuthor { USER, ASSISTANT }

fun AiTaskThreadMessage.author(): ReplyAuthor = if (role == "user") ReplyAuthor.USER else ReplyAuthor.ASSISTANT

enum class ReplyOutcome { CHANGED, ANSWERED, FAILED }

fun AiTaskThreadMessage.replyOutcome(): ReplyOutcome? {
    if (author() == ReplyAuthor.USER) return null
    return when (outcome) {
        "changed" -> ReplyOutcome.CHANGED
        "failed" -> ReplyOutcome.FAILED
        else -> ReplyOutcome.ANSWERED
    }
}

enum class ReplyBlock {
    NOT_PROCESSED_BY_SERVER,
    NOT_COMPLETED,
    CORRECTION_IN_FLIGHT,
    REPLY_LIMIT_REACHED,
    FAILED_TOO_OFTEN,
    PROCESSOR_UNAVAILABLE,
    BUDGET_EXHAUSTED,
    RATE_LIMITED,
    OTHER,
    ;

    companion object {
        fun of(code: String?): ReplyBlock =
            when (code) {
                "not_processed_by_server" -> NOT_PROCESSED_BY_SERVER
                "not_completed" -> NOT_COMPLETED
                "correction_in_flight" -> CORRECTION_IN_FLIGHT
                "reply_limit_reached" -> REPLY_LIMIT_REACHED
                "failed_too_often" -> FAILED_TOO_OFTEN
                "processor_unavailable" -> PROCESSOR_UNAVAILABLE
                "budget_exhausted" -> BUDGET_EXHAUSTED
                "rate_limited" -> RATE_LIMITED
                else -> OTHER
            }
    }
}

fun AiTaskClaudeThread.replyBlock(): ReplyBlock? = if (canReply) null else ReplyBlock.of(replyBlockedReason)

fun AiTask.unreadReplies(): List<AiTaskThreadMessage> =
    claudeThread?.messages.orEmpty().filter { it.author() == ReplyAuthor.ASSISTANT && it.unread }

fun AiTask.hasUnreadReply(): Boolean = unreadReplies().isNotEmpty()

fun AiTask.threadMessageIds(): List<String> = claudeThread?.messages.orEmpty().map { it.id }

fun AiTask.withRepliesRead(ids: Set<String>): AiTask {
    val thread = claudeThread ?: return this
    if (thread.messages.none { it.unread && it.id in ids }) return this
    val messages = thread.messages.map { if (it.unread && it.id in ids) it.copy(unread = false) else it }
    return copy(claudeThread = thread.copy(messages = messages, unreadReplies = messages.count { it.unread }))
}

private val POLLED_TASK_STATES = setOf(ClaudeTaskState.QUEUED, ClaudeTaskState.RUNNING, ClaudeTaskState.RETRYING)

fun List<AiTask>.hasActiveClaudeWork(): Boolean =
    any { task ->
        task.claudeTaskState() in POLLED_TASK_STATES || task.claudeThread?.correction()?.isPolled() == true
    }

fun changedReplyDates(
    previous: List<AiTask>?,
    next: List<AiTask>,
): Set<String> {
    val known = previous?.flatMapTo(mutableSetOf()) { it.threadMessageIds() }
    return next
        .filter { task ->
            task.claudeThread?.messages.orEmpty().any { message ->
                message.replyOutcome() == ReplyOutcome.CHANGED &&
                    if (known == null) message.unread else message.id !in known
            }
        }.mapTo(mutableSetOf()) { it.date }
}
