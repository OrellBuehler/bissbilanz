package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class BissbilanzApiTokenRefreshTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private var token: String? = "old"
    private var refreshCalls = 0
    private val sentTokens = mutableListOf<String?>()

    private fun api(onRequest: (String?) -> HttpStatusCode): BissbilanzApi {
        val engine =
            MockEngine { request ->
                val bearer = request.headers[HttpHeaders.Authorization]
                sentTokens += bearer
                respond(content = "test-bytes", status = onRequest(bearer))
            }
        coEvery { authManager.getAccessToken() } answers { token }
        return BissbilanzApi(
            baseUrl = "https://api.example.com",
            authManager = authManager,
            engine = engine,
        )
    }

    @Test
    fun aRejectedTokenIsRefreshedOnceAndTheRequestRetriedWithTheNewOne() =
        runBlocking {
            coEvery { authManager.refreshToken() } answers {
                refreshCalls++
                token = "refreshed"
                true
            }
            val api = api { bearer -> if (bearer == "Bearer old") HttpStatusCode.Unauthorized else HttpStatusCode.OK }

            api.downloadFile("/api/account")

            assertEquals(1, refreshCalls)
            assertEquals(listOf<String?>("Bearer old", "Bearer refreshed"), sentTokens)
        }

    @Test
    fun aTokenAnotherCallerAlreadyRotatedIsReusedWithoutAnotherRefresh() =
        runBlocking {
            coEvery { authManager.refreshToken() } answers {
                refreshCalls++
                true
            }
            val api =
                api { bearer ->
                    if (bearer == "Bearer old") {
                        token = "rotated"
                        HttpStatusCode.Unauthorized
                    } else {
                        HttpStatusCode.OK
                    }
                }

            api.downloadFile("/api/account")

            assertEquals(0, refreshCalls)
            assertEquals(listOf<String?>("Bearer old", "Bearer rotated"), sentTokens)
        }

    @Test
    fun aFailedRefreshSurfacesAsUnauthorizedAndTheRequestIsNotRepeated() =
        runBlocking {
            coEvery { authManager.refreshToken() } answers {
                refreshCalls++
                false
            }
            val api = api { HttpStatusCode.Unauthorized }

            assertFailsWith<UnauthorizedException> { api.downloadFile("/api/account") }

            assertEquals(1, refreshCalls)
            assertEquals(1, sentTokens.size)
        }

    @Test
    fun aSecondRejectionAfterARefreshIsNotRefreshedAgain() =
        runBlocking {
            coEvery { authManager.refreshToken() } answers {
                refreshCalls++
                token = "refreshed"
                true
            }
            val api = api { HttpStatusCode.Unauthorized }

            runCatching { api.downloadFile("/api/account") }

            assertEquals(1, refreshCalls)
            assertEquals(2, sentTokens.size)
        }
}
