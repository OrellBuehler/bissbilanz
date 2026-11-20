package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.api.generated.model.ChatAction
import com.bissbilanz.api.generated.model.ChatActionPreview
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatConversation
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessage
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.api.generated.model.ChatRun

object ChatTestFixtures {
    const val AT = "2026-11-19T20:56:14.871Z"
    const val RUN = "r1"
    const val ASSISTANT = "m-assistant"

    fun run(
        status: String,
        conversationId: String,
        id: String = RUN,
        changes: List<ChatChange> = emptyList(),
    ) = ChatRun(
        id = id,
        conversationId = conversationId,
        userMessageId = "m-user",
        assistantMessageId = ASSISTANT,
        status = status,
        reason = null,
        changed = changes.map { it.domain },
        changes = changes,
        createdAt = AT,
        startedAt = AT,
        finishedAt = null,
    )

    fun message(
        id: String,
        conversationId: String,
        role: String,
        parts: List<ChatMessagePart>,
        status: String = "completed",
    ) = ChatMessage(
        id = id,
        conversationId = conversationId,
        role = role,
        status = status,
        reason = null,
        runId = RUN,
        parts = parts,
        createdAt = AT,
        updatedAt = AT,
    )

    fun text(value: String) = ChatMessagePart(type = "text", text = value)

    fun accepted(
        conversationId: String,
        request: ChatMessageCreate,
    ) = ChatMessageAcceptedResponse(
        message = message(request.id, conversationId, "user", listOf(text(request.text))),
        run = run("queued", conversationId),
        seq = 1,
    )

    fun action(
        conversationId: String,
        status: String = "pending",
    ) = ChatAction(
        id = "a1",
        conversationId = conversationId,
        runId = RUN,
        messageId = ASSISTANT,
        toolUseId = "toolu_2",
        name = "delete_entry",
        label = "Deleting an entry",
        status = status,
        preview = ChatActionPreview(summary = "Delete yogurt", details = emptyList()),
        expiresAt = "2099-01-01T00:00:00Z",
        decidedAt = null,
        createdAt = AT,
    )

    fun actionPart(action: ChatAction) =
        ChatMessagePart(
            type = "action",
            actionId = action.id,
            toolUseId = action.toolUseId,
            name = action.name,
            label = action.label,
            status = action.status,
            preview = action.preview,
            expiresAt = action.expiresAt,
        )

    fun event(
        seq: Int,
        type: String,
        partIndex: Int? = null,
        text: String? = null,
        status: String? = null,
        run: ChatRun? = null,
        changes: List<ChatChange>? = null,
        capability: ChatCapability? = null,
        message: ChatMessage? = null,
    ) = ChatEvent(
        seq = seq,
        type = type,
        createdAt = AT,
        runId = RUN,
        messageId = if (type == "message_created") null else ASSISTANT,
        partIndex = partIndex,
        text = text,
        status = status,
        changed = changes?.map { it.domain },
        changes = changes,
        run = run,
        capability = capability,
        message = message,
    )

    fun detail(
        conversationId: String,
        messages: List<ChatMessage>,
        lastSeq: Int,
        activeRun: ChatRun? = null,
    ) = ChatConversationDetailResponse(
        conversation =
            ChatConversation(
                id = conversationId,
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
        capability = ChatCapability(available = true),
    )

    fun listItem(id: String) =
        ChatConversationListItem(
            id = id,
            title = "Yogurt",
            createdAt = AT,
            updatedAt = AT,
            lastMessageAt = AT,
            lastSeq = 0,
            activeRun = null,
        )
}
