package com.bissbilanz.api

import com.bissbilanz.api.generated.model.ChatMessageContext
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.writeStringUtf8
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BissbilanzApiChatTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private val requests = mutableListOf<HttpRequestData>()

    private val runJson =
        """{"id":"r1","conversationId":"c1","userMessageId":"m1","assistantMessageId":null,"status":"queued","reason":null,
           "changed":[],"changes":[],"createdAt":"2026-11-19T20:56:14.871Z","startedAt":null,"finishedAt":null}"""

    private val messageJson =
        """{"id":"m1","conversationId":"c1","role":"user","status":"completed","reason":null,"runId":"r1",
           "parts":[{"type":"text","text":"Hi"},{"type":"hologram","glow":3}],
           "createdAt":"2026-11-19T20:56:14.871Z","updatedAt":"2026-11-19T20:56:14.871Z"}"""

    private val conversationJson =
        """{"id":"c1","title":null,"createdAt":"2026-11-19T20:56:14.871Z","updatedAt":"2026-11-19T20:56:14.871Z",
           "lastMessageAt":"2026-11-19T20:56:14.871Z","lastSeq":0}"""

    private fun api(handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData) =
        BissbilanzApi(
            baseUrl = "https://api.example.com",
            authManager = authManager,
            clientPlatform = "android",
            clientVersion = "1.60.0",
            updateGate = UpdateGate(),
            engine =
                MockEngine { request ->
                    requests += request
                    handler(request)
                },
        )

    private fun MockRequestHandleScope.json(
        body: String,
        status: HttpStatusCode = HttpStatusCode.OK,
    ) = respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun MockRequestHandleScope.eventStream(body: String) =
        respond(ByteReadChannel(body), HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/event-stream; charset=utf-8"))

    private fun HttpRequestData.bodyText(): String =
        when (val content = body) {
            is TextContent -> content.text
            is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
            else -> ""
        }

    @Test
    fun sendingAMessagePostsItsIdAndContextWithoutAnIdempotencyKey() =
        runBlocking {
            val api = api { json("""{"message":$messageJson,"run":$runJson,"seq":1}""", HttpStatusCode.Accepted) }

            val accepted =
                api.sendChatMessage(
                    "c1",
                    ChatMessageCreate(
                        id = "m1",
                        text = "Hi",
                        imageFilenames = listOf("/uploads/a.webp"),
                        context = ChatMessageContext(date = "2026-11-18", timezone = "Europe/Zurich", locale = "de"),
                    ),
                )

            val request = requests.single()
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/chat/conversations/c1/messages", request.url.encodedPath)
            assertNull(request.headers["Idempotency-Key"])
            val body = request.bodyText()
            assertTrue(""""id":"m1"""" in body, body)
            assertTrue(""""imageFilenames":["/uploads/a.webp"]""" in body, body)
            assertTrue(""""context":{"date":"2026-11-18","timezone":"Europe/Zurich","locale":"de"}""" in body, body)
            assertEquals(1, accepted.seq)
            assertEquals("queued", accepted.run.status)
            assertEquals(listOf("text", "hologram"), accepted.message.parts.map { it.type })
        }

    @Test
    fun clearingATitleSendsAnExplicitNull() =
        runBlocking {
            val api = api { json("""{"conversation":$conversationJson}""") }

            api.renameChatConversation("c1", null)

            assertEquals(HttpMethod.Patch, requests.single().method)
            assertEquals("""{"title":null}""", requests.single().bodyText())
        }

    @Test
    fun theOtherWritesUseTheirRoutes() =
        runBlocking {
            val api =
                api { request ->
                    when (request.url.encodedPath) {
                        "/api/chat/conversations" -> json("""{"conversation":$conversationJson}""", HttpStatusCode.Created)
                        "/api/chat/runs/r1/cancel" -> json("""{"run":${runJson.replace("queued", "cancelled")}}""")
                        "/api/chat/actions/a1" -> json("""{"action":${actionJson()},"run":$runJson}""")
                        else -> respond("", HttpStatusCode.NoContent)
                    }
                }

            api.createChatConversation("c1")
            val cancelled = api.cancelChatRun("r1")
            api.decideChatAction("a1", approve = true)
            api.deleteChatConversation("c1")

            assertEquals("""{"id":"c1"}""", requests[0].bodyText())
            assertEquals("cancelled", cancelled.status)
            assertEquals("""{"decision":"approve"}""", requests[2].bodyText())
            assertEquals(HttpMethod.Delete, requests[3].method)
            assertTrue(requests.all { it.headers["Idempotency-Key"] == null })
        }

    private fun actionJson() =
        """{"id":"a1","conversationId":"c1","runId":"r1","messageId":"m2","toolUseId":"t","name":"delete_entry",
           "label":"Deleting an entry","status":"approved","preview":{"summary":"Delete","details":[]},
           "expiresAt":null,"decidedAt":null,"createdAt":"2026-11-19T20:56:14.871Z"}"""

    @Test
    fun theStreamYieldsEveryEventAndStepsPastOneThatDoesNotDecode() =
        runBlocking {
            val api =
                api {
                    eventStream(
                        "retry: 3000\n\n" +
                            "id: 1\nevent: text_delta\n" +
                            "data: {\"seq\":1,\"type\":\"text_delta\",\"createdAt\":\"x\",\"partIndex\":0,\"text\":\"Hi\"}\n\n" +
                            ": ping\n\n" +
                            "id: 2\nevent: run_started\n" +
                            "data: {\"seq\":2,\"type\":\"run_started\",\"createdAt\":\"x\",\"run\":{\"id\":\"r1\"}}\n\n" +
                            "id: 3\nevent: telepathy\ndata: {\"seq\":3,\"type\":\"telepathy\",\"createdAt\":\"x\",\"aura\":true}\n\n" +
                            "id: 4\ndata: not json\n\n",
                    )
                }

            val items = api.chatEventStream("c1", after = 0).toList()

            assertEquals(ChatStreamItem.Opened, items[0])
            assertEquals(ChatStreamItem.Retry(3000), items[1])
            assertEquals("Hi", assertIs<ChatStreamItem.Event>(items[2]).event.text)
            assertEquals(ChatStreamItem.Heartbeat, items[3])
            assertEquals(2, assertIs<ChatStreamItem.Malformed>(items[4]).seq)
            assertEquals("telepathy", assertIs<ChatStreamItem.Event>(items[5]).event.type)
            assertEquals(4, assertIs<ChatStreamItem.Malformed>(items[6]).seq)
            assertEquals(7, items.size)
        }

    @Test
    fun theStreamAsksForEventStreamFromTheLastSeqWithoutTheRequestTimeout() =
        runBlocking {
            val api = api { eventStream("") }

            api.chatEventStream("c1", after = 12).toList()

            val request = requests.single()
            assertEquals("12", request.url.parameters["after"])
            assertEquals("12", request.headers["Last-Event-ID"])
            assertEquals(listOf("text/event-stream"), request.headers.getAll(HttpHeaders.Accept))
            assertEquals("android", request.headers["X-Client-Platform"])
            assertNull(request.headers["Idempotency-Key"])
        }

    @Test
    fun aRejectedTokenIsRefreshedBeforeTheStreamOpens() =
        runBlocking {
            var token = "old"
            coEvery { authManager.getAccessToken() } answers { token }
            coEvery { authManager.refreshToken() } answers {
                token = "new"
                true
            }
            val api =
                api { request ->
                    if (request.headers[HttpHeaders.Authorization] == "Bearer old") {
                        respond("", HttpStatusCode.Unauthorized)
                    } else {
                        eventStream("id: 1\ndata: {\"seq\":1,\"type\":\"text_delta\",\"createdAt\":\"x\"}\n\n")
                    }
                }

            val items = api.chatEventStream("c1", after = 0).toList()

            assertEquals(listOf("Bearer old", "Bearer new"), requests.map { it.headers[HttpHeaders.Authorization] })
            assertEquals(1, assertIs<ChatStreamItem.Event>(items.last()).event.seq)
        }

    @Test
    fun aRefusedStreamIsAnApiError() =
        runBlocking {
            val api = api { json("""{"error":"Not found","code":"conversation_not_found"}""", HttpStatusCode.NotFound) }

            val error = assertFailsWith<ApiException> { api.chatEventStream("c1", after = 0).toList() }

            assertEquals(404, error.statusCode)
            assertEquals("conversation_not_found", error.chatError()?.code)
        }

    @Test
    fun aStreamWithoutEvenAHeartbeatStalls() =
        runBlocking {
            val channel = ByteChannel()
            channel.writeStringUtf8("retry: 3000\n\n")
            channel.flush()
            val api = api { respond(channel, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/event-stream")) }

            val error =
                assertFailsWith<ChatStreamStalledException> { api.chatEventStream("c1", after = 0, idleTimeoutMillis = 200).toList() }
            assertTrue("200 ms" in error.message.orEmpty())
        }

    @Test
    fun aPolledPageDecodesEachEventOnItsOwn() =
        runBlocking {
            val api =
                api {
                    json(
                        """{"events":[{"seq":5,"type":"text_delta","createdAt":"x","text":"a"},{"seq":6,"type":"run_started","run":{}},
                           {"seq":7,"type":"text_delta","createdAt":"x","text":"b"}],"nextAfter":7,"lastSeq":9,"hasMore":true,"activeRun":$runJson}""",
                    )
                }

            val page = api.getChatEventsPage("c1", after = 4)

            assertEquals("4", requests.single().url.parameters["after"])
            assertEquals(listOf("a", null, "b"), page.events.map { (it as? ChatStreamItem.Event)?.event?.text })
            assertEquals(6, assertIs<ChatStreamItem.Malformed>(page.events[1]).seq)
            assertEquals(7, page.nextAfter)
            assertEquals(9, page.lastSeq)
            assertTrue(page.hasMore)
            assertEquals("queued", page.activeRun?.status)
        }

    @Test
    fun aRefusalCarriesTheCapability() =
        runBlocking {
            val api =
                api {
                    json(
                        """{"error":"Budget used up","code":"budget_exhausted","capability":{"available":false,"blockedReason":"user_budget_exhausted"}}""",
                        HttpStatusCode.Forbidden,
                    )
                }

            val error = assertFailsWith<ApiException> { api.sendChatMessage("c1", ChatMessageCreate(id = "m1", text = "Hi")) }

            val body = error.chatError()
            assertEquals("budget_exhausted", body?.code)
            assertEquals("user_budget_exhausted", body?.capability?.blockedReason)
        }
}
