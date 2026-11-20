package com.bissbilanz.chat

import com.bissbilanz.api.generated.model.ChatAction
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessage
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.api.generated.model.ChatRun

/** How a run ended that never got an answer message (cancelled while queued, refused up front). */
data class ChatRunEnd(
    val status: String,
    val reason: String?,
)

/** One conversation as the client shows it: messages in display form, folded up to [lastSeq]. */
data class ChatThread(
    val conversationId: String,
    val messages: List<ChatMessage> = emptyList(),
    val lastSeq: Int = 0,
    val activeRun: ChatRun? = null,
    /** The seq of the newest accepted send: a reload older than this would drop that message. */
    val seqFloor: Int = 0,
    /** Runs whose end is known here; a late response never makes one of them active again. */
    val finishedRunIds: Set<String> = emptySet(),
    /** Ends of runs without an answer message, by run id (a user message carries its run's id). */
    val unansweredRuns: Map<String, ChatRunEnd> = emptyMap(),
)

/**
 * Folds chat events into [ChatThread]s the way the server builds its stored messages
 * (`docs/ai-chat.md` §5.3 and §9), so a live answer and a reloaded one look the same. Every
 * event at or below [ChatThread.lastSeq] is ignored, which makes replays after a reconnect
 * harmless: no text is appended twice.
 */
object ChatFolder {
    fun seed(detail: ChatConversationDetailResponse): ChatThread =
        ChatThread(
            conversationId = detail.conversation.id,
            messages = detail.messages,
            lastSeq = detail.lastSeq,
            activeRun = detail.activeRun?.takeIf { ChatStatus.isActiveRun(it.status) },
            finishedRunIds =
                detail.messages
                    .filter { it.role != ChatRole.USER && it.status != ChatStatus.IN_PROGRESS }
                    .mapNotNullTo(mutableSetOf()) { it.runId },
        )

    /**
     * A conversation GET replaces what was folded so far, unless it is older: a stream that
     * kept running while the GET was in flight may already be past its lastSeq, and a send
     * accepted meanwhile may be past it too ([ChatThread.seqFloor]).
     */
    fun reseed(
        current: ChatThread?,
        detail: ChatConversationDetailResponse,
    ): ChatThread {
        if (current == null || current.conversationId != detail.conversation.id) return seed(detail)
        if (detail.lastSeq < maxOf(current.lastSeq, current.seqFloor)) return current
        val seeded = seed(detail)
        val answered = seeded.messages.filter { it.role != ChatRole.USER }.mapNotNullTo(mutableSetOf()) { it.runId }
        return seeded.copy(
            seqFloor = current.seqFloor,
            finishedRunIds = seeded.finishedRunIds + current.finishedRunIds,
            unansweredRuns = current.unansweredRuns.filterKeys { it !in answered },
        )
    }

    /** A send's 202: its message, its run, and a floor no older reload may go below. */
    fun accept(
        thread: ChatThread,
        accepted: ChatMessageAcceptedResponse,
    ): ChatThread =
        thread
            .upserting(accepted.message)
            .withActiveRun(accepted.run)
            .let { it.copy(seqFloor = maxOf(it.seqFloor, accepted.seq)) }

    /**
     * The run a poll reported. No active run in a page is not taken as the end of the run: the
     * page may have been read before its `run_finished` was written, so that event decides.
     */
    fun polled(
        thread: ChatThread,
        run: ChatRun?,
    ): ChatThread = if (run == null) thread else thread.withActiveRun(run)

    fun apply(
        thread: ChatThread,
        event: ChatEvent,
    ): ChatThread {
        if (event.seq <= thread.lastSeq) return thread
        val folded =
            when (event.type) {
                ChatEventType.MESSAGE_CREATED, ChatEventType.MESSAGE_COMPLETED -> event.message?.let { thread.upserting(it) } ?: thread
                ChatEventType.RUN_STARTED, ChatEventType.RUN_RESUMED -> thread.withAssistantMessage(event).withActiveRun(event.run)
                ChatEventType.TEXT_DELTA ->
                    thread.editPart(event) { part ->
                        if (part?.type == ChatPartType.TEXT) {
                            part.copy(text = part.text.orEmpty() + event.text.orEmpty())
                        } else {
                            ChatMessagePart(type = ChatPartType.TEXT, text = event.text.orEmpty())
                        }
                    }
                ChatEventType.TOOL_STARTED ->
                    thread.editPart(event) {
                        ChatMessagePart(
                            type = ChatPartType.TOOL,
                            toolUseId = event.toolUseId,
                            name = event.name,
                            label = event.label,
                            status = ChatStatus.TOOL_RUNNING,
                        )
                    }
                ChatEventType.TOOL_FINISHED ->
                    thread.editPart(event) { part ->
                        val tool =
                            part?.takeIf { it.type == ChatPartType.TOOL }
                                ?: ChatMessagePart(
                                    type = ChatPartType.TOOL,
                                    toolUseId = event.toolUseId,
                                    name = event.name,
                                    label = event.label,
                                )
                        tool.copy(status = event.status, summary = event.summary, changed = event.changed, changes = event.changes)
                    }
                ChatEventType.ACTION_REQUIRED -> {
                    val action = event.action
                    if (action == null) thread else thread.editPart(event) { action.toPart() }.awaiting(event.runId)
                }
                ChatEventType.ACTION_RESOLVED -> thread.resolveAction(event)
                ChatEventType.RUN_FINISHED -> thread.finish(event)
                ChatEventType.ERROR -> thread.failedUnanswered(event)
                else -> thread
            }
        return folded.copy(lastSeq = event.seq)
    }

    /** Steps past an event that is not applied (one that did not decode). */
    fun skip(
        thread: ChatThread,
        seq: Int?,
    ): ChatThread = if (seq != null && seq > thread.lastSeq) thread.copy(lastSeq = seq) else thread

    /** Takes a run state from a response: active runs are followed, a final one ends following. */
    fun withRun(
        thread: ChatThread,
        run: ChatRun?,
    ): ChatThread = thread.withActiveRun(run)

    /** Replaces the action part of [action] with its current state, e.g. from a 409 body. */
    fun withAction(
        thread: ChatThread,
        action: ChatAction,
    ): ChatThread =
        thread.copy(
            messages =
                thread.messages.map { message ->
                    if (message.parts.none { it.type == ChatPartType.ACTION && it.actionId == action.id }) {
                        message
                    } else {
                        message.copy(
                            parts =
                                message.parts.map { part ->
                                    if (part.type == ChatPartType.ACTION && part.actionId == action.id) action.toPart() else part
                                },
                        )
                    }
                },
        )

    private fun ChatThread.upserting(message: ChatMessage): ChatThread {
        val index = messages.indexOfFirst { it.id == message.id }
        val updated = if (index == -1) messages + message else messages.toMutableList().apply { set(index, message) }
        return copy(messages = updated)
    }

    private fun ChatThread.withActiveRun(run: ChatRun?): ChatThread =
        when {
            run == null -> this
            ChatStatus.isActiveRun(run.status) ->
                when {
                    run.id in finishedRunIds -> this
                    // A response that was answered before the run started (`queued`) arriving
                    // after its `run_started` must not set the run back.
                    run.status == ChatStatus.QUEUED && activeRun?.id == run.id && activeRun.status == ChatStatus.RUNNING -> this
                    else -> copy(activeRun = run)
                }
            activeRun?.id == run.id -> copy(activeRun = null, finishedRunIds = finishedRunIds + run.id)
            else -> copy(finishedRunIds = finishedRunIds + run.id)
        }

    private fun ChatThread.hasAnswer(runId: String): Boolean = messages.any { it.role != ChatRole.USER && it.runId == runId }

    /** An `error` before the answer started: shown until its `run_finished` says how the run ended. */
    private fun ChatThread.failedUnanswered(event: ChatEvent): ChatThread {
        val runId = event.runId ?: return this
        if (hasAnswer(runId) || runId in unansweredRuns) return this
        return copy(unansweredRuns = unansweredRuns + (runId to ChatRunEnd(ChatStatus.FAILED, event.code)))
    }

    private fun ChatThread.awaiting(runId: String?): ChatThread {
        val run = activeRun ?: return this
        if (runId != null && run.id != runId) return this
        return copy(activeRun = run.copy(status = ChatStatus.AWAITING_CONFIRMATION))
    }

    private fun ChatThread.withAssistantMessage(event: ChatEvent): ChatThread {
        val id = event.messageId ?: return this
        if (messages.any { it.id == id }) return this
        return copy(messages = messages + newAssistantMessage(id, event))
    }

    private fun ChatThread.newAssistantMessage(
        id: String,
        event: ChatEvent,
    ) = ChatMessage(
        id = id,
        conversationId = conversationId,
        role = ChatRole.ASSISTANT,
        status = ChatStatus.IN_PROGRESS,
        reason = null,
        runId = event.runId,
        parts = emptyList(),
        createdAt = event.createdAt,
        updatedAt = event.createdAt,
    )

    private fun ChatThread.editPart(
        event: ChatEvent,
        transform: (ChatMessagePart?) -> ChatMessagePart,
    ): ChatThread {
        val id = event.messageId ?: return this
        val index = event.partIndex?.takeIf { it >= 0 } ?: return this
        val withMessage = withAssistantMessage(event)
        return withMessage.copy(
            messages =
                withMessage.messages.map { message ->
                    if (message.id != id) return@map message
                    val parts = message.parts.toMutableList()
                    while (parts.size < index) parts += ChatMessagePart(type = ChatPartType.GAP)
                    val edited = transform(parts.getOrNull(index))
                    if (index < parts.size) parts[index] = edited else parts += edited
                    message.copy(parts = parts, updatedAt = event.createdAt)
                },
        )
    }

    private fun ChatThread.resolveAction(event: ChatEvent): ChatThread {
        val status = event.status ?: return this
        val actionId = event.actionId
        val atIndex =
            messages
                .firstOrNull { it.id == event.messageId }
                ?.parts
                ?.getOrNull(event.partIndex ?: -1)
                ?.takeIf { it.type == ChatPartType.ACTION && (actionId == null || it.actionId == actionId) }
        if (atIndex != null) return editPart(event) { atIndex.copy(status = status) }
        if (actionId == null) return this
        return copy(
            messages =
                messages.map { message ->
                    message.copy(
                        parts =
                            message.parts.map { part ->
                                if (part.type == ChatPartType.ACTION && part.actionId == actionId) part.copy(status = status) else part
                            },
                    )
                },
        )
    }

    private fun ChatThread.finish(event: ChatEvent): ChatThread {
        val runId = event.runId ?: event.run?.id
        val messageId = event.messageId
        val finalStatus = event.status ?: event.run?.status
        val settled =
            if (messageId == null || finalStatus == null) {
                messages
            } else {
                messages.map { message ->
                    if (message.id == messageId && message.status == ChatStatus.IN_PROGRESS) {
                        message.copy(status = finalStatus, reason = event.reason ?: event.run?.reason, updatedAt = event.createdAt)
                    } else {
                        message
                    }
                }
            }
        val run = if (runId != null && activeRun?.id == runId) null else activeRun
        val unanswered =
            if (runId != null && messageId == null && finalStatus != null && !hasAnswer(runId)) {
                unansweredRuns + (runId to ChatRunEnd(finalStatus, event.reason ?: event.run?.reason))
            } else {
                unansweredRuns
            }
        return copy(
            messages = settled,
            activeRun = run,
            finishedRunIds = if (runId != null) finishedRunIds + runId else finishedRunIds,
            unansweredRuns = unanswered,
        )
    }

    private fun ChatAction.toPart() =
        ChatMessagePart(
            type = ChatPartType.ACTION,
            actionId = id,
            toolUseId = toolUseId,
            name = name,
            label = label,
            status = status,
            preview = preview,
            expiresAt = expiresAt,
        )
}
