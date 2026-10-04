package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.http.withCharset
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.readRemaining
import io.mockk.mockk
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.io.readByteArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ImagesApiTest {
    private val authManager: AuthManager = mockk(relaxed = true)

    private fun apiResponding(
        status: HttpStatusCode,
        body: String,
        onRequest: suspend (HttpRequestData) -> Unit = {},
    ): BissbilanzApi =
        BissbilanzApi(
            baseUrl = "https://api.example.com",
            authManager = authManager,
            engine =
                MockEngine { request ->
                    onRequest(request)
                    respond(
                        content = body,
                        status = status,
                        headers =
                            headersOf(
                                HttpHeaders.ContentType,
                                ContentType.Application.Json
                                    .withCharset(Charsets.UTF_8)
                                    .toString(),
                            ),
                    )
                },
        )

    private suspend fun HttpRequestData.bodyText(): String {
        val channel = ByteChannel()
        return coroutineScope {
            val read = async { channel.readRemaining().readByteArray().decodeToString() }
            (body as OutgoingContent.WriteChannelContent).writeTo(channel)
            channel.flushAndClose()
            read.await()
        }
    }

    @Test
    fun `uploads the file as the image part of a multipart request with an explicit origin`() =
        runBlocking {
            var contentType: String? = null
            var origin: String? = null
            var text = ""
            val api =
                apiResponding(HttpStatusCode.Created, """{"imageUrl":"/uploads/a.webp"}""") { request ->
                    contentType = request.body.contentType.toString()
                    origin = request.headers[HttpHeaders.Origin]
                    text = request.bodyText()
                }

            val url = api.uploadImage("food.jpg", byteArrayOf(1, 2, 3), purpose = "recipe_step")

            assertEquals("/uploads/a.webp", url)
            assertTrue(contentType.orEmpty().startsWith("multipart/form-data; boundary="))
            assertEquals("https://api.example.com", origin)
            assertTrue("""Content-Disposition: form-data; name="image"; filename="food.jpg"""" in text)
            assertTrue("Content-Type: image/jpeg" in text)
            assertTrue("""Content-Disposition: form-data; name="purpose"""" in text)
            assertTrue("recipe_step" in text)
        }

    @Test
    fun `a rejected upload carries the http status`() =
        runBlocking {
            val api = apiResponding(HttpStatusCode.BadRequest, """{"error":"Missing image file"}""")

            val failure = assertFailsWith<ApiException> { api.uploadImage("food.jpg", byteArrayOf(1)) }

            assertEquals(400, failure.statusCode)
        }
}
