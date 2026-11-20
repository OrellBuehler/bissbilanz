package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatDataRefresher
import com.bissbilanz.android.chat.ChatOutbox
import com.bissbilanz.android.chat.ChatPhoto
import com.bissbilanz.android.chat.ChatRunWatcher
import com.bissbilanz.android.chat.OutgoingChatMessage
import com.bissbilanz.android.chat.ViewedDiaryDay
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.chatError
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessageContext
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
import com.bissbilanz.repository.ChatRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.sync.ConnectivityProvider
import kotlinx.coroutines.CancellationException
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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

data class ChatUiState(
    val openId: String? = null,
    val isNew: Boolean = false,
    val thread: ChatThread? = null,
    val loadingThread: Boolean = false,
    val threadFailed: Boolean = false,
    val listFailed: Boolean = false,
    val connection: ChatConnection? = null,
    val followFailed: Boolean = false,
    val deciding: Set<String> = emptySet(),
    val stopping: Boolean = false,
) {
    val activeRunWorking: Boolean get() = ChatStatus.isWorking(thread?.activeRun?.status)
}

/**
 * The assistant chat (`docs/ai-chat.md`): the conversation list and one open conversation,
 * folded from the server's events while the screen is started ([whileVisible]). Messages are
 * sent through the app-wide [ChatOutbox], so a send outlives the screen.
 */
@OptIn(ExperimentalUuidApi::class)
class ChatViewModel(
    private val chatRepo: ChatRepository,
    private val prefsRepo: PreferencesRepository,
    private val outbox: ChatOutbox,
    private val watcher: ChatRunWatcher,
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

    /** Messages not accepted yet, of every conversation; the screen shows those of the open one. */
    val pending: StateFlow<List<OutgoingChatMessage>> = outbox.messages

    private val _draftRevision = MutableStateFlow(0)

    /**
     * Bumped whenever the draft is set from here (sent, a suggestion, a discarded message put
     * back). The field holds its own text while the user types and only re-reads [draftFor] then.
     */
    val draftRevision: StateFlow<Int> = _draftRevision.asStateFlow()

    private val _attachments = MutableStateFlow<List<ChatPhoto>>(emptyList())
    val attachments: StateFlow<List<ChatPhoto>> = _attachments.asStateFlow()

    /** How many more photos the next message can take: 5 per message, 20 per conversation. */
    val photoRoom: StateFlow<Int> =
        combine(_state, _attachments, outbox.messages) { state, attached, outgoing ->
            val inConversation =
                state.thread
                    ?.messages
                    .orEmpty()
                    .filter { it.role == ChatRole.USER }
                    .sumOf { message -> message.parts.count { it.type == ChatPartType.IMAGE } } +
                    outgoing.filter { it.conversationId == state.openId && it.accepted == null }.sumOf { it.photos.size }
            minOf(MAX_PHOTOS_PER_MESSAGE - attached.size, MAX_PHOTOS_PER_CONVERSATION - inConversation - attached.size).coerceAtLeast(0)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, MAX_PHOTOS_PER_MESSAGE)

    private val _messages = MutableSharedFlow<Int>(extraBufferCapacity = 4)

    /** One-shot snackbar messages as string resource ids. */
    val messages: SharedFlow<Int> = _messages.asSharedFlow()

    /** The app's language as a BCP 47 tag; the assistant answers in it. Set by the screen. */
    var clientLocale: String? = null

    private val followGeneration = MutableStateFlow(0)
    private var startedNewForEmptyList = false

    init {
        viewModelScope.launch {
            combine(outbox.messages, _state.map { it.openId }.distinctUntilChanged()) { outgoing, id -> outgoing to id }
                .collect { (outgoing, id) -> if (id != null) takeAccepted(id, outgoing) }
        }
        viewModelScope.launch { outbox.failures.collect { onSendFailed(it) } }
    }

    /**
     * Runs while the screen is started: loads the list, the open conversation, and follows
     * its events for as long as a run is active. Cancelled when the screen stops; the next
     * start reloads the conversation and continues from its last seq.
     */
    suspend fun whileVisible() {
        if (appModeManager.isLocal) return
        try {
            follow()
        } finally {
            // The answer goes on without the screen; the diary should not wait for it.
            handOffActiveRun()
        }
    }

    private suspend fun follow() {
        coroutineScope {
            launch { loadConversations() }
            _state.map { it.openId }.distinctUntilChanged().collectLatest { id ->
                if (id == null) return@collectLatest
                watcher.stop(id)
                if (!_state.value.isNew) reload(id)
                combine(
                    _state.map { state -> state.thread?.takeIf { it.conversationId == id }?.activeRun != null }.distinctUntilChanged(),
                    followGeneration,
                ) { active, _ -> active }.collectLatest { active -> if (active) follow(id) }
            }
        }
    }

    private fun handOffActiveRun() {
        val thread = _state.value.thread ?: return
        if (thread.activeRun != null) watcher.watch(thread.conversationId, thread.lastSeq)
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

    /** A new chat, optionally starting with [text] and [photos] in the composer. */
    fun startNew(
        text: String = "",
        photos: List<ChatPhoto> = emptyList(),
    ) {
        val id = Uuid.random().toString()
        savedStateHandle[draftKey(id)] = text
        setOpen(id, isNew = true, thread = ChatThread(id))
        _attachments.value = photos
        _draftRevision.update { it + 1 }
    }

    /** "New chat" on a message the full chat refused: the message moves along with it. */
    fun startNewWith(messageId: String) {
        val message = outbox.find(messageId) ?: return
        if (message.sending) return
        outbox.remove(listOf(messageId))
        startNew(message.text, message.photos)
    }

    /** "New chat" under an answer the chat was too long for: the question moves along. */
    fun startNewFromRun(runId: String?) {
        val question =
            _state.value.thread
                ?.messages
                ?.lastOrNull { it.role == ChatRole.USER && it.runId == runId }
                ?.parts
                ?.filter { it.type == ChatPartType.TEXT }
                ?.mapNotNull { it.text }
                ?.joinToString("\n\n")
        startNew(question.orEmpty())
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
        if (_state.value.thread?.conversationId != id) handOffActiveRun()
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
        if (_state.value.openId != id || !_state.value.isNew) return
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

    fun draftFor(id: String?): String = id?.let { savedStateHandle.get<String>(draftKey(it)) }.orEmpty()

    /** What the user typed; the field keeps its own state, so nothing is sent back. */
    fun updateDraft(text: String) {
        val id = _state.value.openId ?: return
        savedStateHandle[draftKey(id)] = text
    }

    /** Puts [text] into the composer, e.g. a suggestion. */
    fun setDraft(text: String) {
        updateDraft(text)
        _draftRevision.update { it + 1 }
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
        // A conversation still loading (or that failed to) has no thread yet: what it holds, and
        // whether a run is busy in it, is not known.
        return state.openId != null &&
            state.thread?.conversationId == state.openId &&
            trimmed.isNotEmpty() &&
            trimmed.length <= MAX_TEXT_CHARS &&
            !state.activeRunWorking &&
            outbox.messages.value.none { it.conversationId == state.openId && it.sending } &&
            ChatProblems.block(capability.value) == null
    }

    fun send() {
        val state = _state.value
        val conversationId = state.openId ?: return
        val text = draftFor(conversationId).trim()
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
        _draftRevision.update { it + 1 }
        _attachments.value = emptyList()
        outbox.send(message)
    }

    fun retry(messageId: String) {
        if (!connectivity.isOnline.value) {
            _messages.tryEmit(R.string.chat_send_offline)
            return
        }
        outbox.retry(messageId)
    }

    /**
     * Drops a message that could not be sent and puts its text and photos back into an empty
     * composer. After a network failure the server may have it anyway (the answer was lost):
     * then it is only dropped, since sending the text again would do everything twice.
     */
    fun discard(messageId: String) {
        val message = outbox.find(messageId) ?: return
        if (message.sending) return
        val outcomeUnknown = message.problem == ChatSendProblem.NETWORK || message.problem == ChatSendProblem.UNKNOWN
        if (!outcomeUnknown) {
            outbox.remove(listOf(messageId))
            putBack(message)
            return
        }
        viewModelScope.launch {
            val detail =
                try {
                    chatRepo.conversation(message.conversationId)
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    report(e)
                    _messages.emit(R.string.chat_discard_unverified)
                    return@launch
                }
            outbox.remove(listOf(messageId))
            if (_state.value.openId == message.conversationId) applyDetail(message.conversationId, detail)
            if (detail.messages.none { it.id == message.id }) putBack(message)
        }
    }

    private fun putBack(message: OutgoingChatMessage) {
        if (_state.value.openId != message.conversationId || draftFor(message.conversationId).isNotBlank()) return
        setDraft(message.text)
        if (_attachments.value.isEmpty()) _attachments.value = message.photos
    }

    private fun messageContext() =
        ChatMessageContext(
            date = viewedDay.current(),
            timezone = TimeZone.currentSystemDefault().id,
            locale = clientLocale,
        )

    /** Shows what the outbox delivered to the open conversation. */
    private fun takeAccepted(
        id: String,
        outgoing: List<OutgoingChatMessage>,
    ) {
        val mine = outgoing.filter { it.conversationId == id }
        if (mine.any { !it.createsConversation }) markCreated(id)
        if (currentThread(id) == null) return
        val accepted = mine.filter { it.accepted != null }
        if (accepted.isEmpty()) return
        accepted.forEach { message -> message.accepted?.let { onAccepted(id, it) } }
        outbox.remove(accepted.map { it.id })
    }

    private fun onAccepted(
        id: String,
        accepted: ChatMessageAcceptedResponse,
    ) {
        updateThread(id) { ChatFolder.accept(it, accepted) }
        val following = currentThread(id)?.activeRun?.id == accepted.run.id
        chatRepo.noteActiveRun(id, accepted.run.takeIf { following })
        if (following) {
            reconnectIfPolling()
        } else {
            // A retried send can come back with a run that already ended (its first answer was
            // lost): nothing will be followed, so the answer is read and its changes refreshed.
            refresh(ChatRefreshPlan.of(accepted.run.changed, accepted.run.changes))
            viewModelScope.launch { reload(id) }
        }
    }

    private suspend fun onSendFailed(message: OutgoingChatMessage) {
        when (message.problem) {
            ChatSendProblem.RUN_ACTIVE -> if (_state.value.openId == message.conversationId) reload(message.conversationId)
            ChatSendProblem.CONVERSATION_GONE -> refreshConversationsQuietly()
            ChatSendProblem.SIGNED_OUT -> _messages.emit(R.string.chat_signed_out)
            else -> {}
        }
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

    /**
     * Asks the server to stop the active run. A run still stopping is followed until it reports
     * its end; one the answer already shows as ended is read back, since following stops with it.
     */
    fun stop() {
        val state = _state.value
        val conversationId = state.openId ?: return
        val run = state.thread?.activeRun ?: return
        if (state.stopping) return
        _state.update { it.copy(stopping = true) }
        viewModelScope.launch {
            try {
                val result = chatRepo.cancel(run.id)
                updateThread(conversationId) { ChatFolder.withRun(it, result) }
                if (ChatStatus.isActiveRun(result.status)) {
                    reconnectIfPolling()
                } else {
                    _state.update { it.copy(stopping = false) }
                    refresh(ChatRefreshPlan.of(result.changed, result.changes))
                    reload(conversationId)
                }
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
            _state.update { if (it.openId == id) it.copy(followFailed = true) else it }
            when {
                e.isGone() -> conversationGone(id)
                e is UnauthorizedException || (e as? ApiException)?.statusCode == 401 -> _messages.emit(R.string.chat_signed_out)
                else -> report(e)
            }
        } finally {
            _state.update { if (it.openId == id) it.copy(connection = null) else it }
        }
    }

    private fun onFeed(
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
            is ChatFeedItem.Polled -> updateThread(id) { ChatFolder.polled(it, item.activeRun) }
            is ChatFeedItem.Connection -> _state.update { if (it.openId == id) it.copy(connection = item.state) else it }
        }
    }

    private fun applyEvent(
        id: String,
        event: ChatEvent,
    ) {
        val before = currentThread(id) ?: return
        val after = ChatFolder.apply(before, event)
        if (after === before) return
        updateThread(id) { after }
        when (event.type) {
            ChatEventType.MESSAGE_CREATED -> event.message?.id?.let { outbox.remove(listOf(it)) }
            ChatEventType.RUN_STARTED, ChatEventType.RUN_RESUMED -> chatRepo.noteActiveRun(id, after.activeRun)
            ChatEventType.TOOL_FINISHED -> refresh(ChatRefreshPlan.of(event.changed, event.changes))
            ChatEventType.RUN_FINISHED -> {
                // Everything the run changed, even what its tool calls refreshed already: a
                // later write can have touched the same day again.
                refresh(ChatRefreshPlan.of(event.changed ?: event.run?.changed, event.changes ?: event.run?.changes))
                _state.update { it.copy(stopping = false) }
                chatRepo.noteActiveRun(id, after.activeRun)
                viewModelScope.launch { refreshConversationsQuietly() }
            }
        }
    }

    private fun refresh(plan: ChatRefreshPlan) = refresher.request(plan, viewedDay.current())

    private suspend fun reload(id: String) {
        if (currentThread(id) == null) _state.update { it.copy(loadingThread = true, threadFailed = false) }
        try {
            val detail = chatRepo.conversation(id)
            applyDetail(id, detail)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _state.update { it.copy(loadingThread = false, threadFailed = currentThread(id) == null) }
            if (e.isGone()) conversationGone(id) else report(e)
        }
    }

    private fun applyDetail(
        id: String,
        detail: ChatConversationDetailResponse,
    ) {
        if (_state.value.openId != id) return
        val old = currentThread(id)
        val fresh = ChatFolder.reseed(old, detail)
        // A run that ended while nothing followed it (the app was in the background) never
        // delivered its run_finished here; what it changed is in its tool parts.
        val endedRun = old?.activeRun?.takeIf { fresh !== old && fresh.activeRun?.id != it.id }
        if (endedRun != null) refresh(ChatRefreshPlan.ofRun(fresh.messages, endedRun.id))
        _state.update { state ->
            state.copy(
                thread = fresh,
                loadingThread = false,
                threadFailed = false,
                stopping = state.stopping && fresh.activeRun != null,
            )
        }
        outbox.remove(
            outbox.messages.value
                .filter { outgoing -> fresh.messages.any { it.id == outgoing.id } }
                .map { it.id },
        )
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
