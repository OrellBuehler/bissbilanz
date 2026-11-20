package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatDataRefresher
import com.bissbilanz.android.chat.ViewedDiaryDay
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.chatError
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessageContext
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.chat.ChatConnection
import com.bissbilanz.chat.ChatEventType
import com.bissbilanz.chat.ChatFeedItem
import com.bissbilanz.chat.ChatFolder
import com.bissbilanz.chat.ChatPartType
import com.bissbilanz.chat.ChatProblems
import com.bissbilanz.chat.ChatRefreshPlan
import com.bissbilanz.chat.ChatRole
import com.bissbilanz.chat.ChatSendProblem
import com.bissbilanz.chat.ChatStatus
import com.bissbilanz.chat.ChatThread
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.ChatRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.sync.ConnectivityProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** A photo picked for the next message, as the JPEG that gets uploaded. */
class ChatPhoto(
    val id: String,
    val jpeg: ByteArray,
)

/**
 * A message the server has not accepted yet. Its [id] is the idempotency key: every retry
 * sends the same id, so a send whose answer was lost never creates a second message.
 */
data class OutgoingChatMessage(
    val id: String,
    val conversationId: String,
    val text: String,
    val photos: List<ChatPhoto>,
    val context: ChatMessageContext,
    val createsConversation: Boolean,
    val uploadedFilenames: List<String>? = null,
    val sending: Boolean = true,
    val problem: ChatSendProblem? = null,
    val retryAfterSeconds: Long? = null,
)

data class ChatUiState(
    val openId: String? = null,
    val isNew: Boolean = false,
    val thread: ChatThread? = null,
    val loadingThread: Boolean = false,
    val threadFailed: Boolean = false,
    val listFailed: Boolean = false,
    val outbox: List<OutgoingChatMessage> = emptyList(),
    val connection: ChatConnection? = null,
    val followFailed: Boolean = false,
    val deciding: Set<String> = emptySet(),
    val stopping: Boolean = false,
) {
    val activeRunWorking: Boolean get() = ChatStatus.isWorking(thread?.activeRun?.status)
}

/**
 * The assistant chat (`docs/ai-chat.md`): the conversation list and one open conversation,
 * folded from the server's events while the screen is started ([whileVisible]).
 */
@OptIn(ExperimentalCoroutinesApi::class, ExperimentalUuidApi::class)
class ChatViewModel(
    private val chatRepo: ChatRepository,
    private val prefsRepo: PreferencesRepository,
    private val aiTaskRepo: AiTaskRepository,
    private val refresher: ChatDataRefresher,
    private val viewedDay: ViewedDiaryDay,
    private val connectivity: ConnectivityProvider,
    private val appModeManager: AppModeManager,
    private val errorReporter: ErrorReporter,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    val conversations: StateFlow<List<ChatConversationListItem>?> = chatRepo.conversations

    /** Null while unknown (offline, not loaded yet): the composer then stays usable. */
    val capability: StateFlow<ChatCapability?> = prefsRepo.chatCapability

    private val _state =
        MutableStateFlow(
            savedStateHandle.get<String>(KEY_OPEN).let { id ->
                val isNew = savedStateHandle.get<Boolean>(KEY_OPEN_NEW) == true
                ChatUiState(openId = id, isNew = isNew, thread = if (id != null && isNew) ChatThread(id) else null)
            },
        )
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    val draft: StateFlow<String> =
        _state
            .map { it.openId }
            .distinctUntilChanged()
            .flatMapLatest { id -> if (id == null) flowOf("") else savedStateHandle.getStateFlow(draftKey(id), "") }
            .stateIn(viewModelScope, SharingStarted.Eagerly, _state.value.openId?.let { savedStateHandle[draftKey(it)] } ?: "")

    private val _attachments = MutableStateFlow<List<ChatPhoto>>(emptyList())
    val attachments: StateFlow<List<ChatPhoto>> = _attachments.asStateFlow()

    /** How many more photos the next message can take: 5 per message, 20 per conversation. */
    val photoRoom: StateFlow<Int> =
        combine(_state, _attachments) { state, attached ->
            val inConversation =
                state.thread
                    ?.messages
                    .orEmpty()
                    .filter { it.role == ChatRole.USER }
                    .sumOf { message -> message.parts.count { it.type == ChatPartType.IMAGE } } +
                    state.outbox.filter { it.conversationId == state.openId }.sumOf { it.photos.size }
            minOf(MAX_PHOTOS_PER_MESSAGE - attached.size, MAX_PHOTOS_PER_CONVERSATION - inConversation - attached.size).coerceAtLeast(0)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, MAX_PHOTOS_PER_MESSAGE)

    private val _messages = MutableSharedFlow<Int>(extraBufferCapacity = 4)

    /** One-shot snackbar messages as string resource ids. */
    val messages: SharedFlow<Int> = _messages.asSharedFlow()

    /** The app's language as a BCP 47 tag; the assistant answers in it. Set by the screen. */
    var clientLocale: String? = null

    private val followGeneration = MutableStateFlow(0)
    private val refreshedByRun = mutableMapOf<String, ChatRefreshPlan>()
    private var startedNewForEmptyList = false

    /**
     * Runs while the screen is started: loads the list, the open conversation, and follows
     * its events for as long as a run is active. Cancelled when the screen stops; the next
     * start reloads the conversation and continues from its last seq.
     */
    suspend fun whileVisible() {
        if (appModeManager.isLocal) return
        coroutineScope {
            launch { loadConversations() }
            _state.map { it.openId }.distinctUntilChanged().collectLatest { id ->
                if (id == null) return@collectLatest
                if (!_state.value.isNew) reload(id)
                combine(
                    _state.map { state -> state.thread?.takeIf { it.conversationId == id }?.activeRun != null }.distinctUntilChanged(),
                    followGeneration,
                ) { active, _ -> active }.collectLatest { active -> if (active) follow(id) }
            }
        }
    }

    suspend fun refreshConversations() = loadConversations()

    private suspend fun loadConversations() {
        try {
            chatRepo.refreshConversations()
            _state.update { it.copy(listFailed = false) }
            if (!startedNewForEmptyList && _state.value.openId == null && chatRepo.conversations.value.isNullOrEmpty()) {
                startedNewForEmptyList = true
                startNew()
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(listFailed = true) }
            report(e)
        }
    }

    private suspend fun refreshConversationsQuietly() {
        try {
            chatRepo.refreshConversations()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            report(e)
        }
    }

    fun open(id: String) {
        if (id == _state.value.openId) return
        setOpen(id, isNew = false, thread = null)
    }

    fun startNew() {
        val id = Uuid.random().toString()
        setOpen(id, isNew = true, thread = ChatThread(id))
    }

    fun close() {
        setOpen(null, isNew = false, thread = null)
        viewModelScope.launch { refreshConversationsQuietly() }
    }

    /** One state update, so whatever follows the open conversation never sees a half switch. */
    private fun setOpen(
        id: String?,
        isNew: Boolean,
        thread: ChatThread?,
    ) {
        savedStateHandle[KEY_OPEN] = id
        savedStateHandle[KEY_OPEN_NEW] = isNew
        _attachments.value = emptyList()
        _state.update {
            it.copy(
                openId = id,
                isNew = isNew,
                thread = thread,
                loadingThread = false,
                threadFailed = false,
                stopping = false,
                followFailed = false,
                connection = null,
            )
        }
    }

    private fun markCreated(id: String) {
        if (_state.value.openId != id) return
        savedStateHandle[KEY_OPEN_NEW] = false
        _state.update { it.copy(isNew = false) }
    }

    fun rename(
        id: String,
        title: String,
    ) {
        viewModelScope.launch {
            try {
                chatRepo.rename(id, title.trim().take(MAX_TITLE_CHARS).ifEmpty { null })
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                report(e)
                _messages.emit(R.string.chat_rename_failed)
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                chatRepo.delete(id)
                savedStateHandle.remove<String>(draftKey(id))
                if (_state.value.openId == id) close()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                report(e)
                _messages.emit(R.string.chat_delete_failed)
            }
        }
    }

    /** Re-reads the open conversation, and starts following again after following failed. */
    fun retryLoad() {
        val id = _state.value.openId ?: return
        viewModelScope.launch {
            reload(id)
            followGeneration.update { it + 1 }
        }
    }

    fun updateDraft(text: String) {
        val id = _state.value.openId ?: return
        savedStateHandle[draftKey(id)] = text
    }

    fun attach(photos: List<ByteArray>) {
        val room = photoRoom.value
        if (room <= 0) return
        _attachments.update { it + photos.take(room).map { bytes -> ChatPhoto(Uuid.random().toString(), bytes) } }
    }

    fun removeAttachment(id: String) {
        _attachments.update { list -> list.filter { it.id != id } }
    }

    fun canSend(text: String): Boolean {
        val trimmed = text.trim()
        val state = _state.value
        return state.openId != null &&
            trimmed.isNotEmpty() &&
            trimmed.length <= MAX_TEXT_CHARS &&
            !state.activeRunWorking &&
            state.outbox.none { it.conversationId == state.openId && it.sending } &&
            ChatProblems.block(capability.value) == null
    }

    fun send() {
        val state = _state.value
        val conversationId = state.openId ?: return
        val text = draft.value.trim()
        if (!canSend(text)) return
        if (!connectivity.isOnline.value) {
            _messages.tryEmit(R.string.chat_send_offline)
            return
        }
        val message =
            OutgoingChatMessage(
                id = Uuid.random().toString(),
                conversationId = conversationId,
                text = text,
                photos = _attachments.value,
                context = messageContext(),
                createsConversation = state.isNew,
            )
        savedStateHandle[draftKey(conversationId)] = ""
        _attachments.value = emptyList()
        _state.update { it.copy(outbox = it.outbox + message) }
        deliver(message)
    }

    fun retry(messageId: String) {
        val message = _state.value.outbox.firstOrNull { it.id == messageId } ?: return
        if (message.sending) return
        if (!connectivity.isOnline.value) {
            _messages.tryEmit(R.string.chat_send_offline)
            return
        }
        deliver(message)
    }

    /** Drops a message that could not be sent; its text goes back to an empty composer. */
    fun discard(messageId: String) {
        val message = _state.value.outbox.firstOrNull { it.id == messageId } ?: return
        if (message.sending) return
        _state.update { state -> state.copy(outbox = state.outbox.filter { it.id != messageId }) }
        if (_state.value.openId == message.conversationId && draft.value.isBlank()) {
            savedStateHandle[draftKey(message.conversationId)] = message.text
            if (_attachments.value.isEmpty()) _attachments.value = message.photos
        }
    }

    private fun messageContext() =
        ChatMessageContext(
            date = viewedDay.date.value,
            timezone = TimeZone.currentSystemDefault().id,
            locale = clientLocale,
        )

    private fun deliver(message: OutgoingChatMessage) {
        updateOutbox(message.id) { copy(sending = true, problem = null, retryAfterSeconds = null) }
        viewModelScope.launch {
            var current = message
            try {
                refresher.flushLocalChanges()
                if (current.createsConversation) {
                    chatRepo.createConversation(current.conversationId)
                    markCreated(current.conversationId)
                    current = current.copy(createsConversation = false)
                    updateOutbox(current.id) { copy(createsConversation = false) }
                }
                val filenames =
                    current.uploadedFilenames ?: uploadPhotos(current.photos).also { files ->
                        current = current.copy(uploadedFilenames = files)
                        updateOutbox(current.id) { copy(uploadedFilenames = files) }
                    }
                val accepted =
                    try {
                        chatRepo.send(current.conversationId, current.toRequest(filenames))
                    } catch (e: ApiException) {
                        if (ChatProblems.sendProblem(e) != ChatSendProblem.MESSAGE_ID_CONFLICT) throw e
                        val fresh = current.copy(id = Uuid.random().toString())
                        val oldId = current.id
                        current = fresh
                        updateOutbox(oldId) { fresh }
                        chatRepo.send(fresh.conversationId, fresh.toRequest(filenames))
                    }
                val sent = current
                _state.update { state ->
                    val thread =
                        state.thread?.takeIf { it.conversationId == sent.conversationId }?.let {
                            ChatFolder.withRun(ChatFolder.upsert(it, accepted.message), accepted.run)
                        } ?: state.thread
                    state.copy(thread = thread, outbox = state.outbox.filter { it.id != sent.id })
                }
                chatRepo.noteActiveRun(sent.conversationId, accepted.run.takeIf { ChatStatus.isActiveRun(it.status) })
                reconnectIfPolling()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                onSendFailed(current, e)
            }
        }
    }

    private suspend fun uploadPhotos(photos: List<ChatPhoto>): List<String> =
        if (photos.isEmpty()) {
            emptyList()
        } else {
            aiTaskRepo.uploadPhotos(
                photos.mapIndexed {
                    index,
                    photo,
                    ->
                    "chat_$index.jpg" to photo.jpeg
                },
            )
        }

    private fun OutgoingChatMessage.toRequest(filenames: List<String>) =
        ChatMessageCreate(id = id, text = text, imageFilenames = filenames.ifEmpty { null }, context = context)

    private suspend fun onSendFailed(
        message: OutgoingChatMessage,
        e: Exception,
    ) {
        val problem = ChatProblems.sendProblem(e)
        if (problem == ChatSendProblem.UNKNOWN ||
            problem == ChatSendProblem.INVALID ||
            (problem == ChatSendProblem.NETWORK && e is ApiException)
        ) {
            errorReporter.captureException(e)
        } else {
            errorReporter.addBreadcrumb("Assistant chat message not sent: $problem", CATEGORY)
        }
        updateOutbox(message.id) {
            copy(sending = false, problem = problem, retryAfterSeconds = (e as? ApiException)?.retryAfterSeconds)
        }
        when (problem) {
            ChatSendProblem.RUN_ACTIVE -> if (_state.value.openId == message.conversationId) reload(message.conversationId)
            ChatSendProblem.CONVERSATION_GONE -> refreshConversationsQuietly()
            ChatSendProblem.SIGNED_OUT -> _messages.emit(R.string.chat_signed_out)
            else -> {}
        }
    }

    private fun updateOutbox(
        id: String,
        transform: OutgoingChatMessage.() -> OutgoingChatMessage,
    ) {
        _state.update { state -> state.copy(outbox = state.outbox.map { if (it.id == id) it.transform() else it }) }
    }

    fun approve(actionId: String) = decide(actionId, approve = true)

    fun reject(actionId: String) = decide(actionId, approve = false)

    private fun decide(
        actionId: String,
        approve: Boolean,
    ) {
        val conversationId = _state.value.openId ?: return
        if (actionId in _state.value.deciding) return
        _state.update { it.copy(deciding = it.deciding + actionId) }
        viewModelScope.launch {
            try {
                val response = chatRepo.decide(actionId, approve)
                updateThread(conversationId) { ChatFolder.withRun(ChatFolder.withAction(it, response.action), response.run) }
                reconnectIfPolling()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val api = e as? ApiException
                when (api?.statusCode) {
                    409 -> {
                        api.chatError()?.action?.let { action -> updateThread(conversationId) { ChatFolder.withAction(it, action) } }
                        _messages.emit(
                            if (api.chatError()?.code ==
                                "action_expired"
                            ) {
                                R.string.chat_action_expired
                            } else {
                                R.string.chat_action_already_decided
                            },
                        )
                        reload(conversationId)
                    }
                    404 -> {
                        _messages.emit(R.string.chat_action_already_decided)
                        reload(conversationId)
                    }
                    else -> {
                        report(e)
                        _messages.emit(R.string.chat_action_failed)
                    }
                }
            } finally {
                _state.update { it.copy(deciding = it.deciding - actionId) }
            }
        }
    }

    /** Asks the server to stop the active run; following goes on until the run reports its end. */
    fun stop() {
        val state = _state.value
        val conversationId = state.openId ?: return
        val run = state.thread?.activeRun ?: return
        if (state.stopping) return
        _state.update { it.copy(stopping = true) }
        viewModelScope.launch {
            try {
                chatRepo.cancel(run.id)
                reconnectIfPolling()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val status = (e as? ApiException)?.statusCode
                if (status == 409 || status == 404) {
                    reload(conversationId)
                } else {
                    report(e)
                    _state.update { it.copy(stopping = false) }
                    _messages.emit(R.string.chat_stop_failed)
                }
            }
        }
    }

    /** A poll can wait 30 s while a confirmation is open; after a decision the answer should not. */
    private fun reconnectIfPolling() {
        if (_state.value.connection == ChatConnection.POLLING) followGeneration.update { it + 1 }
    }

    private suspend fun follow(id: String) {
        _state.update { it.copy(followFailed = false) }
        try {
            chatRepo.follow(id) { currentThread(id)?.lastSeq ?: 0 }.collect { onFeed(id, it) }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(followFailed = true) }
            when {
                e.isGone() -> conversationGone(id)
                e is UnauthorizedException || (e as? ApiException)?.statusCode == 401 -> _messages.emit(R.string.chat_signed_out)
                else -> report(e)
            }
        } finally {
            _state.update { it.copy(connection = null) }
        }
    }

    private suspend fun onFeed(
        id: String,
        item: ChatFeedItem,
    ) {
        when (item) {
            is ChatFeedItem.Event -> applyEvent(id, item.event)
            is ChatFeedItem.Malformed -> {
                errorReporter.captureException(item.cause)
                updateThread(id) { ChatFolder.skip(it, item.seq) }
                viewModelScope.launch { reload(id) }
            }
            is ChatFeedItem.Polled ->
                updateThread(id) { it.copy(activeRun = item.activeRun?.takeIf { run -> ChatStatus.isActiveRun(run.status) }) }
            is ChatFeedItem.Connection -> _state.update { it.copy(connection = item.state) }
        }
    }

    private suspend fun applyEvent(
        id: String,
        event: ChatEvent,
    ) {
        val before = currentThread(id) ?: return
        val after = ChatFolder.apply(before, event)
        if (after === before) return
        updateThread(id) { after }
        when (event.type) {
            ChatEventType.MESSAGE_CREATED ->
                _state.update { state -> state.copy(outbox = state.outbox.filter { it.id != event.message?.id }) }
            ChatEventType.RUN_STARTED, ChatEventType.RUN_RESUMED -> chatRepo.noteActiveRun(id, after.activeRun)
            ChatEventType.TOOL_FINISHED -> requestRefresh(event.runId, ChatRefreshPlan.of(event.changed, event.changes), final = false)
            ChatEventType.RUN_FINISHED -> {
                event.capability?.let { chatRepo.updateCapability(it) }
                requestRefresh(
                    event.runId,
                    ChatRefreshPlan.of(event.changed ?: event.run?.changed, event.changes ?: event.run?.changes),
                    final = true,
                )
                _state.update { it.copy(stopping = false) }
                chatRepo.noteActiveRun(id, after.activeRun)
                viewModelScope.launch { refreshConversationsQuietly() }
            }
        }
    }

    /** Refreshes what a run changed, minus what its earlier tool calls already refreshed. */
    private fun requestRefresh(
        runId: String?,
        plan: ChatRefreshPlan,
        final: Boolean,
    ) {
        val key = runId.orEmpty()
        val done = refreshedByRun[key] ?: ChatRefreshPlan.EMPTY
        val todo = plan - done
        if (!todo.isEmpty) refresher.request(todo, viewedDay.date.value)
        if (final) refreshedByRun.remove(key) else refreshedByRun[key] = done + todo
    }

    private suspend fun reload(id: String) {
        if (currentThread(id) == null) _state.update { it.copy(loadingThread = true, threadFailed = false) }
        try {
            val detail = chatRepo.conversation(id)
            if (_state.value.openId != id) return
            val old = currentThread(id)
            val fresh = ChatFolder.reseed(old, detail)
            // A run that ended while nothing followed it (the app was in the background)
            // never delivered its run_finished here; what it changed is in its tool parts.
            val endedRun = old?.activeRun?.takeIf { fresh.activeRun?.id != it.id }
            if (endedRun != null) requestRefresh(endedRun.id, ChatRefreshPlan.ofRun(fresh.messages, endedRun.id), final = true)
            _state.update { state ->
                state.copy(
                    thread = fresh,
                    loadingThread = false,
                    threadFailed = false,
                    stopping = state.stopping && fresh.activeRun != null,
                    outbox = state.outbox.filter { outgoing -> fresh.messages.none { it.id == outgoing.id } },
                )
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(loadingThread = false, threadFailed = currentThread(id) == null) }
            if (e.isGone()) conversationGone(id) else report(e)
        }
    }

    private suspend fun conversationGone(id: String) {
        savedStateHandle.remove<String>(draftKey(id))
        if (_state.value.openId == id) {
            close()
            _messages.emit(R.string.chat_conversation_gone)
        }
    }

    private fun currentThread(id: String): ChatThread? = _state.value.thread?.takeIf { it.conversationId == id }

    private fun updateThread(
        id: String,
        transform: (ChatThread) -> ChatThread,
    ) {
        _state.update { state ->
            val thread = state.thread?.takeIf { it.conversationId == id } ?: return@update state
            state.copy(thread = transform(thread))
        }
    }

    private fun Exception.isGone(): Boolean = this is ApiException && statusCode == 404

    /** Network trouble and refusals the user is told about are expected and only leave a breadcrumb. */
    private fun report(e: Exception) {
        val expected =
            e is UnauthorizedException ||
                (e is ApiException && e.statusCode in 400..499) ||
                (e !is ApiException && generateSequence<Throwable>(e) { it.cause }.any { it is java.io.IOException })
        if (expected) {
            errorReporter.addBreadcrumb("Assistant chat request failed: ${e.message.orEmpty().take(120)}", CATEGORY)
        } else {
            errorReporter.captureException(e)
        }
    }

    private fun draftKey(id: String) = "$KEY_DRAFT_PREFIX$id"

    companion object {
        const val MAX_TEXT_CHARS = 4000
        const val MAX_TITLE_CHARS = 120
        const val MAX_PHOTOS_PER_MESSAGE = 5
        const val MAX_PHOTOS_PER_CONVERSATION = 20
        private const val KEY_OPEN = "chat_open_conversation"
        private const val KEY_OPEN_NEW = "chat_open_is_new"
        private const val KEY_DRAFT_PREFIX = "chat_draft_"
        private const val CATEGORY = "assistant-chat"
    }
}
