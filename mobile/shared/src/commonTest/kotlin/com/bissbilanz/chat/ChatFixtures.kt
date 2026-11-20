package com.bissbilanz.chat

import com.bissbilanz.api.generated.model.ChatAction
import com.bissbilanz.api.generated.model.ChatActionPreview
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatConversation
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessage
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.api.generated.model.ChatRun

object ChatFixtures {
    const val CONVERSATION = "c1"
    const val RUN = "r1"
    const val USER_MESSAGE = "m-user"
    const val ASSISTANT_MESSAGE = "m-assistant"
    const val AT = "2026-11-19T20:56:14.871Z"

    fun run(
        status: String = ChatStatus.RUNNING,
        id: String = RUN,
        reason: String? = null,
        changes: List<ChatChange> = emptyList(),
    ) = ChatRun(
        id = id,
        conversationId = CONVERSATION,
        userMessageId = USER_MESSAGE,
        assistantMessageId = ASSISTANT_MESSAGE,
        status = status,
        reason = reason,
        changed = changes.map { it.domain },
        changes = changes,
        createdAt = AT,
        startedAt = AT,
        finishedAt = null,
    )

    fun userMessage(
        text: String = "Log 150 g yogurt",
        id: String = USER_MESSAGE,
    ) = ChatMessage(
        id = id,
        conversationId = CONVERSATION,
        role = ChatRole.USER,
        status = ChatStatus.COMPLETED,
        reason = null,
        runId = RUN,
        parts = listOf(ChatMessagePart(type = ChatPartType.TEXT, text = text)),
        createdAt = AT,
        updatedAt = AT,
    )

    fun assistantMessage(
        parts: List<ChatMessagePart>,
        status: String = ChatStatus.COMPLETED,
        reason: String? = null,
    ) = ChatMessage(
        id = ASSISTANT_MESSAGE,
        conversationId = CONVERSATION,
        role = ChatRole.ASSISTANT,
        status = status,
        reason = reason,
        runId = RUN,
        parts = parts,
        createdAt = AT,
        updatedAt = AT,
    )

    fun action(
        status: String = ChatStatus.ACTION_PENDING,
        id: String = "a1",
    ) = ChatAction(
        id = id,
        conversationId = CONVERSATION,
        runId = RUN,
        messageId = ASSISTANT_MESSAGE,
        toolUseId = "toolu_2",
        name = "delete_entry",
        label = "Deleting an entry",
        status = status,
        preview = ChatActionPreview(summary = "Delete “Greek yogurt” from Breakfast", details = listOf("2 servings · 120 kcal")),
        expiresAt = "2026-11-19T21:56:15.139Z",
        decidedAt = null,
        createdAt = AT,
    )

    fun event(
        seq: Int,
        type: String,
        partIndex: Int? = null,
        text: String? = null,
        status: String? = null,
        message: ChatMessage? = null,
        run: ChatRun? = null,
        action: ChatAction? = null,
        actionId: String? = null,
        changes: List<ChatChange>? = null,
        reason: String? = null,
        capability: ChatCapability? = null,
        name: String? = null,
        label: String? = null,
        toolUseId: String? = null,
    ) = ChatEvent(
        seq = seq,
        type = type,
        createdAt = AT,
        runId = RUN,
        messageId = if (type == ChatEventType.MESSAGE_CREATED) null else ASSISTANT_MESSAGE,
        partIndex = partIndex,
        text = text,
        toolUseId = toolUseId,
        name = name,
        label = label,
        status = status,
        changed = changes?.map { it.domain },
        changes = changes,
        reason = reason,
        actionId = actionId,
        action = action,
        message = message,
        run = run,
        capability = capability,
    )

    fun detail(
        messages: List<ChatMessage>,
        lastSeq: Int,
        activeRun: ChatRun? = null,
        capability: ChatCapability = ChatCapability(available = true),
    ) = ChatConversationDetailResponse(
        conversation =
            ChatConversation(
                id = CONVERSATION,
                title = "Yogurt",
                createdAt = AT,
                updatedAt = AT,
                lastMessageAt = AT,
                lastSeq = lastSeq,
            ),
        messages = messages,
        pendingActions = emptyList(),
        activeRun = activeRun,
        lastSeq = lastSeq,
        capability = capability,
    )
}
