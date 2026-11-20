package com.bissbilanz.api

import com.bissbilanz.api.generated.model.ChatActionDecision
import com.bissbilanz.api.generated.model.ChatActionDecisionResponse
import com.bissbilanz.api.generated.model.ChatConversation
import com.bissbilanz.api.generated.model.ChatConversationCreate
import com.bissbilanz.api.generated.model.ChatConversationDetailResponse
import com.bissbilanz.api.generated.model.ChatConversationResponse
import com.bissbilanz.api.generated.model.ChatConversationUpdate
import com.bissbilanz.api.generated.model.ChatConversationsResponse
import com.bissbilanz.api.generated.model.ChatErrorResponse
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatMessageAcceptedResponse
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.api.generated.model.ChatRunResponse
import io.ktor.client.plugins.HttpTimeoutConfig
import io.ktor.client.plugins.contentnegotiation.exclude
import io.ktor.client.plugins.timeout
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.utils.io.readUTF8Line
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/** The server sends a `: ping` every 20 s; nothing for this long means the stream is dead. */
const val CHAT_STREAM_IDLE_TIMEOUT_MS = 45_000L

/** One item read from the events endpoint, in either of its forms. */
sealed interface ChatStreamItem {
    /** The stream answered 200 and is open. */
    data object Opened : ChatStreamItem

    /** A comment line (`: ping`, every 20 s): the body is coming through. */
    data object Heartbeat : ChatStreamItem

    /** The server's `retry:` hint, the delay before reconnecting after the stream ends. */
    data class Retry(
        val millis: Long,
    ) : ChatStreamItem

    data class Event(
        val event: ChatEvent,
    ) : ChatStreamItem

    /** An event that did not decode. Its seq, when readable, still has to be stepped past. */
    data class Malformed(
        val seq: Int?,
        val cause: Exception,
    ) : ChatStreamItem
}

/** One page of the JSON form of the events endpoint, each event decoded on its own. */
data class ChatEventPage(
    val events: List<ChatStreamItem>,
    val nextAfter: Int,
    val lastSeq: Int,
    val hasMore: Boolean,
    val activeRun: ChatRun?,
)

class ChatStreamStalledException(
    idleMillis: Long,
) : Exception("No data on the chat event stream for $idleMillis ms")

/**
 * The assistant chat (`docs/ai-chat.md`). No call sends an `Idempotency-Key`: a message's own
 * id is its idempotency key and every other route is safe to retry as it is.
 */
interface ChatApi : ApiTransport {
    suspend fun listChatConversations(
        limit: Int? = null,
        offset: Int? = null,
    ): ChatConversationsResponse =
        get("/api/chat/conversations") {
            limit?.let { parameter("limit", it) }
            offset?.let { parameter("offset", it) }
        }

    suspend fun createChatConversation(
        id: String,
        title: String? = null,
    ): ChatConversation {
        val response: ChatConversationResponse = post("/api/chat/conversations", ChatConversationCreate(id = id, title = title))
        return response.conversation
    }

    suspend fun getChatConversation(id: String): ChatConversationDetailResponse = get("/api/chat/conversations/$id")

    suspend fun renameChatConversation(
        id: String,
        title: String?,
    ): ChatConversation {
        val response: ChatConversationResponse = patch("/api/chat/conversations/$id", ChatConversationUpdate(title = title))
        return response.conversation
    }

    suspend fun deleteChatConversation(id: String) = delete("/api/chat/conversations/$id")

    suspend fun sendChatMessage(
        conversationId: String,
        message: ChatMessageCreate,
    ): ChatMessageAcceptedResponse = post("/api/chat/conversations/$conversationId/messages", message)

    suspend fun cancelChatRun(runId: String): ChatRun {
        val response: ChatRunResponse = post("/api/chat/runs/$runId/cancel", JsonObject(emptyMap()))
        return response.run
    }

    suspend fun decideChatAction(
        actionId: String,
        approve: Boolean,
    ): ChatActionDecisionResponse =
        post(
            "/api/chat/actions/$actionId",
            ChatActionDecision(if (approve) ChatActionDecision.Decision.approve else ChatActionDecision.Decision.reject),
        )

    /** The JSON form of the events endpoint, for polling when the stream keeps failing. */
    suspend fun getChatEventsPage(
        conversationId: String,
        after: Int,
        limit: Int? = null,
    ): ChatEventPage {
        val body: JsonObject =
            get("/api/chat/conversations/$conversationId/events") {
                parameter("after", after)
                limit?.let { parameter("limit", it) }
            }
        return ChatEventPage(
            events = body["events"]?.jsonArray.orEmpty().map { json.decodeChatEvent(it, fallbackSeq = null) },
            nextAfter = body["nextAfter"]?.jsonPrimitive?.intOrNull ?: after,
            lastSeq = body["lastSeq"]?.jsonPrimitive?.intOrNull ?: after,
            hasMore = body["hasMore"]?.jsonPrimitive?.booleanOrNull ?: false,
            activeRun = body["activeRun"]?.takeUnless { it is JsonNull }?.let { json.decodeFromJsonElement(ChatRun.serializer(), it) },
        )
    }

    /**
     * The server-sent events after [after]: the stored ones, then new ones as they happen,
     * until the server closes the stream (after 10 minutes, or when a newer stream of the same
     * user pushes it out). The request goes through the client's auth like every other call,
     * so a 401 is refreshed before the stream opens; once it is open nothing is retried here.
     * The global request timeout would cut the stream, so it is lifted for this request and an
     * idle limit takes its place: no line, not even the heartbeat, for [idleTimeoutMillis]
     * throws [ChatStreamStalledException].
     */
    fun chatEventStream(
        conversationId: String,
        after: Int,
        idleTimeoutMillis: Long = CHAT_STREAM_IDLE_TIMEOUT_MS,
    ): Flow<ChatStreamItem> =
        flow {
            val path = "/api/chat/conversations/$conversationId/events"
            client
                .prepareGet(path) {
                    applyClientVersionHeaders(clientPlatform, clientVersion)
                    parameter("after", after)
                    exclude(ContentType.Application.Json)
                    header(HttpHeaders.Accept, EVENT_STREAM)
                    if (after > 0) header(LAST_EVENT_ID, after.toString())
                    timeout {
                        requestTimeoutMillis = HttpTimeoutConfig.INFINITE_TIMEOUT_MS
                        socketTimeoutMillis = idleTimeoutMillis
                    }
                }.execute { response ->
                    if (!response.status.isSuccess()) {
                        val body = response.bodyAsText()
                        throw ApiException("GET $path failed: HTTP ${response.status.value} $body", response.status.value, response, body)
                    }
                    emit(ChatStreamItem.Opened)
                    val channel = response.bodyAsChannel()
                    val parser = SseParser()
                    var retry: Long? = null
                    while (true) {
                        var stalled = true
                        val line =
                            withTimeoutOrNull(idleTimeoutMillis) {
                                channel.readUTF8Line().also { stalled = false }
                            }
                        if (stalled) throw ChatStreamStalledException(idleTimeoutMillis)
                        if (line == null) break
                        if (line.startsWith(":")) emit(ChatStreamItem.Heartbeat)
                        val message = parser.feed(line)
                        if (parser.retryMillis != retry) {
                            retry = parser.retryMillis
                            retry?.let { emit(ChatStreamItem.Retry(it)) }
                        }
                        if (message != null) emit(json.decodeChatEvent(message.data, message.id?.toIntOrNull()))
                    }
                }
        }
}

private const val EVENT_STREAM = "text/event-stream"
private const val LAST_EVENT_ID = "Last-Event-ID"

internal fun Json.decodeChatEvent(
    data: String,
    fallbackSeq: Int?,
): ChatStreamItem =
    try {
        ChatStreamItem.Event(decodeFromString(ChatEvent.serializer(), data))
    } catch (e: IllegalArgumentException) {
        ChatStreamItem.Malformed(readSeq(e) { parseToJsonElement(data) } ?: fallbackSeq, e)
    }

internal fun Json.decodeChatEvent(
    element: JsonElement,
    fallbackSeq: Int?,
): ChatStreamItem =
    try {
        ChatStreamItem.Event(decodeFromJsonElement(ChatEvent.serializer(), element))
    } catch (e: IllegalArgumentException) {
        ChatStreamItem.Malformed(readSeq(e) { element } ?: fallbackSeq, e)
    }

/** The seq of an event that did not decode; a body that is not even JSON travels with [decodeError]. */
private fun readSeq(
    decodeError: Exception,
    element: () -> JsonElement,
): Int? =
    try {
        (element() as? JsonObject)?.get("seq")?.jsonPrimitive?.intOrNull
    } catch (e: IllegalArgumentException) {
        decodeError.addSuppressed(e)
        null
    }

private val chatErrorJson = Json { ignoreUnknownKeys = true }

/**
 * The structured body of a failed chat call, or null when it has none (a proxy's HTML page,
 * say). Why it did not parse is kept on this exception, for when it is reported.
 */
fun ApiException.chatError(): ChatErrorResponse? {
    val body = responseBody?.takeIf { it.isNotBlank() } ?: return null
    return try {
        chatErrorJson.decodeFromString(ChatErrorResponse.serializer(), body)
    } catch (e: IllegalArgumentException) {
        if (suppressedExceptions.none { it.message == e.message }) addSuppressed(e)
        null
    }
}
