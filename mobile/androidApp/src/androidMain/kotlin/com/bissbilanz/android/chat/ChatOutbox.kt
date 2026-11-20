package com.bissbilanz.android.chat

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessageContext
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.chat.ChatProblems
import com.bissbilanz.chat.ChatSendProblem
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.ChatRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** A photo picked for a message, as the JPEG that gets uploaded. */
class ChatPhoto(
    val id: String,
    val jpeg: ByteArray,
)

/**
 * A message on its way to the server. Its [id] is the idempotency key: every retry sends the
 * same id, so a send whose answer was lost never creates a second message. [accepted] holds
 * the 202 until the chat screen has shown it.
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
    val accepted: ChatMessageAcceptedResponse? = null,
)

/**
 * Messages on their way to the assistant. Owned by the app rather than the chat screen, so a
 * send carries on when the screen is closed mid-send; a message that failed waits here with
 * its text and photos until the user retries or discards it.
 */
@OptIn(ExperimentalUuidApi::class)
class ChatOutbox(
    private val chatRepo: ChatRepository,
    private val aiTaskRepo: AiTaskRepository,
    private val refresher: ChatDataRefresher,
    private val errorReporter: ErrorReporter,
    private val scope: CoroutineScope,
) {
    private val _messages = MutableStateFlow<List<OutgoingChatMessage>>(emptyList())
    val messages: StateFlow<List<OutgoingChatMessage>> = _messages.asStateFlow()

    private val _failures = MutableSharedFlow<OutgoingChatMessage>(extraBufferCapacity = 8)

    /** Every failed attempt, for the open chat to react to. */
    val failures: SharedFlow<OutgoingChatMessage> = _failures.asSharedFlow()

    fun send(message: OutgoingChatMessage) {
        _messages.update { it + message }
        deliver(message)
    }

    fun retry(id: String) {
        val message = find(id) ?: return
        if (message.sending || message.accepted != null) return
        deliver(message)
    }

    fun find(id: String): OutgoingChatMessage? = _messages.value.firstOrNull { it.id == id }

    fun remove(ids: Collection<String>) {
        if (ids.isEmpty()) return
        _messages.update { list -> list.filter { it.id !in ids } }
    }

    /** Sign-out and account switches. */
    fun clear() {
        _messages.value = emptyList()
    }

    private fun update(
        id: String,
        transform: OutgoingChatMessage.() -> OutgoingChatMessage,
    ) {
        _messages.update { list -> list.map { if (it.id == id) it.transform() else it } }
    }

    private fun deliver(message: OutgoingChatMessage) {
        update(message.id) { copy(sending = true, problem = null, retryAfterSeconds = null) }
        scope.launch {
            var current = message
            try {
                refresher.flushLocalChanges()
                if (current.createsConversation) {
                    chatRepo.createConversation(current.conversationId)
                    current = current.copy(createsConversation = false)
                    update(current.id) { copy(createsConversation = false) }
                }
                val filenames =
                    current.uploadedFilenames ?: upload(current.photos).also { files ->
                        current = current.copy(uploadedFilenames = files)
                        update(current.id) { copy(uploadedFilenames = files) }
                    }
                val accepted =
                    try {
                        chatRepo.send(current.conversationId, current.toRequest(filenames))
                    } catch (e: ApiException) {
                        if (ChatProblems.sendProblem(e) != ChatSendProblem.MESSAGE_ID_CONFLICT) throw e
                        val fresh = current.copy(id = Uuid.random().toString())
                        update(current.id) { fresh }
                        current = fresh
                        chatRepo.send(fresh.conversationId, fresh.toRequest(filenames))
                    }
                update(current.id) { copy(sending = false, accepted = accepted) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                failed(current, e)
            }
        }
    }

    private suspend fun upload(photos: List<ChatPhoto>): List<String> =
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

    private fun failed(
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
            errorReporter.addBreadcrumb("Assistant chat message not sent: $problem", "assistant-chat")
        }
        val retryAfter = (e as? ApiException)?.retryAfterSeconds
        update(message.id) { copy(sending = false, problem = problem, retryAfterSeconds = retryAfter) }
        find(message.id)?.let { _failures.tryEmit(it) }
    }
}
