package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class BissbilanzApiSupplementsTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private val requests = mutableListOf<HttpRequestData>()

    private fun api(status: HttpStatusCode) =
        BissbilanzApi(
            baseUrl = "https://api.example.com",
            authManager = authManager,
            clientPlatform = "android",
            clientVersion = "1.53.0",
            updateGate = UpdateGate(),
            engine =
                MockEngine { request ->
                    requests += request
                    if (status.value < 400) respond("", status) else respondError(status)
                },
        )

    @Test
    fun unlogDeletesTheDatePathTheServerRoutes() =
        runBlocking {
            api(HttpStatusCode.NoContent).unlogSupplement("s1", "2026-10-04", "key-1", "2026-10-04T08:00:00Z")

            val request = requests.single()
            assertEquals(HttpMethod.Delete, request.method)
            assertEquals("/api/supplements/s1/log/2026-10-04", request.url.encodedPath)
            assertEquals("", request.url.encodedQuery)
            assertEquals("key-1", request.headers["Idempotency-Key"])
            assertEquals("2026-10-04T08:00:00Z", request.headers["X-Client-Edited-At"])
        }

    @Test
    fun unlogSurfacesAServerRejection() =
        runBlocking<Unit> {
            val error =
                assertFailsWith<ApiException> {
                    api(HttpStatusCode.MethodNotAllowed).unlogSupplement("s1", "2026-10-04")
                }

            assertEquals(405, error.statusCode)
        }
}
