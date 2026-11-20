package com.bissbilanz.repository

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.ChatApi
import com.bissbilanz.api.ChatEventPage
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.api.chatError
import com.bissbilanz.api.generated.model.ChatActionDecisionResponse
import com.bissbilanz.api.generated.model.ChatConversation
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.chat.ChatEventFollower
import com.bissbilanz.chat.ChatEventSource
import com.bissbilanz.chat.ChatEventType
import com.bissbilanz.chat.ChatFeedItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update

/**
 * The assistant chat. Online only, nothing is cached on disk and nothing goes through the
 * offline sync queue (`docs/ai-chat.md` §4). Every capability a chat response carries is
 * handed to [PreferencesRepository.chatCapability].
 */
class ChatRepository(
    private val api: ChatApi,
    private val prefsRepo: PreferencesRepository,
) : ChatEventSource {
    private val follower = ChatEventFollower(this)

    private val _conversations = MutableStateFlow<List<ChatConversationListItem>?>(null)

    /** Most recently active first; null until the first load. */
    val conversations: StateFlow<List<ChatConversationListItem>?> = _conversations.asStateFlow()

    /**
     * Changes with every sign-out and account switch: an answer that lands after one belongs
     * to the previous account and must not be written anywhere.
     */
    val accountGeneration: Int get() = prefsRepo.accountGeneration

    suspend fun refreshConversations() {
        val generation = accountGeneration
        val conversations = api.listChatConversations(limit = LIST_LIMIT).conversations
        if (generation == accountGeneration) _conversations.value = conversations
    }

    /** Creating an id that already exists returns it again, so this is safe to retry. */
    suspend fun createConversation(id: String): ChatConversation {
        val generation = accountGeneration
        val conversation = api.createChatConversation(id)
        if (generation != accountGeneration) return conversation
        _conversations.update { list ->
            val item =
                ChatConversationListItem(
                    id = conversation.id,
                    title = conversation.title,
                    createdAt = conversation.createdAt,
                    updatedAt = conversation.updatedAt,
                    lastMessageAt = conversation.lastMessageAt,
                    lastSeq = conversation.lastSeq,
                    activeRun = null,
                )
            listOf(item) + list.orEmpty().filter { it.id != id }
        }
        return conversation
    }

    suspend fun conversation(id: String): ChatConversationDetailResponse {
        val generation = prefsRepo.accountGeneration
        val detail = api.getChatConversation(id)
        if (generation != accountGeneration) return detail
        prefsRepo.updateChatCapability(detail.capability, generation)
        _conversations.update { list ->
            list?.map { item ->
                if (item.id == id) {
                    item.copy(title = detail.conversation.title, lastSeq = detail.lastSeq, activeRun = detail.activeRun)
                } else {
                    item
                }
            }
        }
        return detail
    }

    suspend fun rename(
        id: String,
        title: String?,
    ) {
        val conversation = api.renameChatConversation(id, title)
        _conversations.update { list -> list?.map { if (it.id == id) it.copy(title = conversation.title) else it } }
    }

    /** A conversation that is already gone (deleted on another device) counts as deleted. */
    suspend fun delete(id: String) {
        try {
            api.deleteChatConversation(id)
        } catch (e: ApiException) {
            if (e.statusCode != 404) throw e
        }
        _conversations.update { list -> list?.filter { it.id != id } }
    }

    /** A refusal that carries the capability (403) updates it before the error is rethrown. */
    suspend fun send(
        conversationId: String,
        message: ChatMessageCreate,
    ): ChatMessageAcceptedResponse {
        val generation = prefsRepo.accountGeneration
        return try {
            api.sendChatMessage(conversationId, message)
        } catch (e: ApiException) {
            if (e.statusCode == 403) e.chatError()?.capability?.let { prefsRepo.updateChatCapability(it, generation) }
            throw e
        }
    }

    suspend fun cancel(runId: String): ChatRun = api.cancelChatRun(runId)

    suspend fun decide(
        actionId: String,
        approve: Boolean,
    ): ChatActionDecisionResponse = api.decideChatAction(actionId, approve)

    /** The events of a conversation; the capability each `run_finished` carries is applied on the way. */
    fun follow(
        conversationId: String,
        after: () -> Int,
    ): Flow<ChatFeedItem> =
        flow {
            val generation = prefsRepo.accountGeneration
            emitAll(
                follower.follow(conversationId, after).onEach { item ->
                    val event = (item as? ChatFeedItem.Event)?.event
                    if (event?.type == ChatEventType.RUN_FINISHED) event.capability?.let { prefsRepo.updateChatCapability(it, generation) }
                },
            )
        }

    /**
     * One page of events of a run nothing streams (the chat screen was left mid-answer); the
     * capability its `run_finished` carries is applied like on the stream.
     */
    suspend fun pollRun(
        conversationId: String,
        after: Int,
    ): ChatEventPage {
        val generation = accountGeneration
        val page = api.getChatEventsPage(conversationId, after)
        page.events.forEach { item ->
            val event = (item as? ChatStreamItem.Event)?.event
            if (event?.type == ChatEventType.RUN_FINISHED) event.capability?.let { prefsRepo.updateChatCapability(it, generation) }
        }
        return page
    }

    /** Run state seen while a conversation is open, so the list shows it without a reload. */
    fun noteActiveRun(
        conversationId: String,
        run: ChatRun?,
    ) {
        _conversations.update { list -> list?.map { if (it.id == conversationId) it.copy(activeRun = run) else it } }
    }

    /** Sign-out and account switches: one account's conversations never show for the next. */
    fun clear() {
        _conversations.value = null
    }

    override fun stream(
        conversationId: String,
        after: Int,
    ): Flow<ChatStreamItem> = api.chatEventStream(conversationId, after)

    override suspend fun poll(
        conversationId: String,
        after: Int,
    ): ChatEventPage = api.getChatEventsPage(conversationId, after)

    companion object {
        const val LIST_LIMIT = 100
    }
}
