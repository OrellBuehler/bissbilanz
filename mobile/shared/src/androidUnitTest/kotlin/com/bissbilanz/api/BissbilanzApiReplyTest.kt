package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BissbilanzApiReplyTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private val requests = mutableListOf<HttpRequestData>()

    private val taskJson =
        """
        {"id":"t1","userId":"u1","status":"completed","description":"2 eggs","photoUrl":null,"photoUrls":[],
         "date":"2026-10-12","mealType":"Breakfast","eatenAt":null,"source":"android","resultSummary":"Logged 2 eggs",
         "createdEntryIds":["e1"],"completedAt":null,"dismissedAt":null,"acknowledgedAt":null,
         "processedBy":"assistant","processedByKind":"claude",
         "claudeThread":{"messages":[
           {"id":"m1","role":"user","text":"It was 3 eggs","outcome":null,"createdAt":"2026-10-12T10:00:00Z","unread":false},
           {"id":"m2","role":"narrator","text":"Fixed","outcome":"rewound","createdAt":"2026-10-12T10:01:00Z","unread":true}],
          "correctionState":"pondering","canReply":false,"replyBlockedReason":"stars_misaligned",
          "repliesRemaining":4,"unreadReplies":1}}
        """.trimIndent()

    private fun api(
        status: HttpStatusCode,
        body: String,
        vararg headers: Pair<String, String>,
    ) = BissbilanzApi(
        baseUrl = "https://api.example.com",
        authManager = authManager,
        clientPlatform = "android",
        clientVersion = "1.58.0",
        updateGate = UpdateGate(),
        engine =
            MockEngine { request ->
                requests += request
                val all = listOf(HttpHeaders.ContentType to listOf("application/json")) + headers.map { it.first to listOf(it.second) }
                respond(body, status, headersOf(*all.toTypedArray()))
            },
    )

    @Test
    fun aReplyPostsTheTextWithItsIdempotencyKey() =
        runBlocking {
            val result = api(HttpStatusCode.Created, """{"task":$taskJson}""").replyToAiTask("t1", "It was 3 eggs", "key-1")

            val request = requests.single()
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/ai-tasks/t1/replies", request.url.encodedPath)
            assertEquals("key-1", request.headers["Idempotency-Key"])
            assertNull(request.headers["X-Client-Edited-At"])
            assertEquals("""{"text":"It was 3 eggs"}""", (request.body as TextContent).text)
            assertEquals("t1", result.task.id)
            assertFalse(result.replayed)
        }

    @Test
    fun unknownThreadValuesDecodeInsteadOfCrashing() =
        runBlocking {
            val thread = api(HttpStatusCode.Created, """{"task":$taskJson}""").replyToAiTask("t1", "x", "k").task.claudeThread

            assertEquals("pondering", thread?.correctionState)
            assertEquals("stars_misaligned", thread?.replyBlockedReason)
            assertEquals("narrator", thread?.messages?.last()?.role)
            assertEquals("rewound", thread?.messages?.last()?.outcome)
        }

    @Test
    fun aReplayedReplyIsFlagged() =
        runBlocking {
            val result =
                api(HttpStatusCode.Created, """{"task":$taskJson}""", "x-idempotent-replay" to "true")
                    .replyToAiTask("t1", "It was 3 eggs", "key-1")

            assertTrue(result.replayed)
        }

    @Test
    fun aRejectionCarriesItsCodeAndRetryAfterAndIsNotRetried() =
        runBlocking<Unit> {
            val error =
                assertFailsWith<ApiException> {
                    api(
                        HttpStatusCode.TooManyRequests,
                        """{"error":"Too many replies","code":"rate_limited"}""",
                        HttpHeaders.RetryAfter to "3600",
                    ).replyToAiTask("t1", "x", "key-1")
                }

            assertEquals(429, error.statusCode)
            assertEquals("rate_limited", error.errorCode())
            assertEquals(3600L, error.retryAfterSeconds)
            assertEquals(1, requests.size)
        }

    @Test
    fun aRequestStillInProgressIsRecognisedByItsError() =
        runBlocking<Unit> {
            val error =
                assertFailsWith<ApiException> {
                    api(HttpStatusCode.ServiceUnavailable, """{"error":"request_in_progress"}""", HttpHeaders.RetryAfter to "2")
                        .replyToAiTask("t1", "x", "key-1")
                }

            assertEquals(503, error.statusCode)
            assertEquals("request_in_progress", error.errorCode())
            assertEquals(2L, error.retryAfterSeconds)
            assertEquals(1, requests.size)
        }

    @Test
    fun aBodyWithoutJsonHasNoCode() =
        runBlocking<Unit> {
            val error =
                assertFailsWith<ApiException> {
                    api(HttpStatusCode.BadGateway, "<html>bad gateway</html>", HttpHeaders.RetryAfter to "soon")
                        .replyToAiTask("t1", "x", "key-1")
                }

            assertNull(error.errorCode())
            assertNull(error.retryAfterSeconds)
            assertNull(ApiException("plain").errorCode())
        }

    @Test
    fun acknowledgingRepliesNamesOnlyTheReplies() =
        runBlocking {
            val count =
                api(HttpStatusCode.OK, """{"acknowledged":0,"repliesAcknowledged":2}""")
                    .acknowledgeAiTaskReplies(listOf("m2", "m3"))

            val request = requests.single()
            assertEquals("/api/ai-tasks/acknowledge", request.url.encodedPath)
            assertEquals("""{"replyIds":["m2","m3"]}""", (request.body as TextContent).text)
            assertNull(request.headers["Idempotency-Key"])
            assertEquals(2, count)
        }

    @Test
    fun anOlderServerWithoutTheReplyCountReadsAsNone() =
        runBlocking {
            assertEquals(0, api(HttpStatusCode.OK, """{"acknowledged":0}""").acknowledgeAiTaskReplies(listOf("m2")))
        }

    @Test
    fun acknowledgingDismissalsStillSendsAnEmptyBody() =
        runBlocking {
            api(HttpStatusCode.OK, """{"acknowledged":3}""").acknowledgeAiTasks()

            assertEquals("{}", (requests.single().body as TextContent).text)
        }
}
