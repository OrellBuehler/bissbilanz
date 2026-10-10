package com.bissbilanz.auth

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import java.io.IOException
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthManagerRefreshTest {
    private val stored = mutableMapOf("access_token" to "old-access", "refresh_token" to "old-refresh")
    private val secureStorage: SecureStorage = mockk(relaxed = true)
    private var now = 1_000_000L
    private var requests = 0

    @BeforeTest
    fun setup() {
        every { secureStorage.load(any()) } answers { stored[firstArg()] }
        every { secureStorage.save(any(), any()) } answers { stored[firstArg()] = secondArg() }
        every { secureStorage.delete(any()) } answers { stored.remove(firstArg<String>()) }
    }

    private fun manager(handler: suspend MockRequestHandleScope.() -> HttpResponseData): AuthManager {
        val engine =
            MockEngine {
                requests++
                handler()
            }
        return AuthManager(
            baseUrl = "https://test.example.com",
            secureStorage = secureStorage,
            engine = engine,
            nowMs = { now },
        ).also { it.initialize() }
    }

    private fun MockRequestHandleScope.tokens() =
        respond(
            content = """{"access_token":"new-access","refresh_token":"new-refresh","token_type":"Bearer","expires_in":3600}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json"),
        )

    @Test
    fun aSuccessfulRefreshStoresTheRotatedPair() =
        runBlocking {
            val auth = manager { tokens() }

            assertTrue(auth.refreshToken())

            assertEquals("new-access", stored["access_token"])
            assertEquals("new-refresh", stored["refresh_token"])
            assertEquals(AuthState.Authenticated, auth.authState.value)
        }

    @Test
    fun concurrentRefreshesShareOneRequest() =
        runBlocking {
            val auth = manager { tokens() }

            val results = (1..5).map { async { auth.refreshToken() } }.awaitAll()

            assertTrue(results.all { it })
            assertEquals(1, requests)
        }

    @Test
    fun aRateLimitedRefreshKeepsTheSessionAndWaitsOutRetryAfter() =
        runBlocking {
            val auth =
                manager {
                    respondError(HttpStatusCode.TooManyRequests, headers = headersOf(HttpHeaders.RetryAfter, "30"))
                }

            assertFalse(auth.refreshToken())
            assertEquals(1, requests)
            assertEquals("old-refresh", stored["refresh_token"])
            assertEquals(AuthState.Authenticated, auth.authState.value)

            now += 29_000
            assertFalse(auth.refreshToken())
            assertEquals(1, requests)

            now += 1_000
            assertFalse(auth.refreshToken())
            assertEquals(2, requests)
        }

    @Test
    fun aRateLimitWithoutRetryAfterWaitsAMinute() =
        runBlocking {
            val auth = manager { respondError(HttpStatusCode.TooManyRequests) }

            auth.refreshToken()
            now += 59_000
            auth.refreshToken()
            assertEquals(1, requests)

            now += 1_000
            auth.refreshToken()
            assertEquals(2, requests)
        }

    @Test
    fun retryAfterIsCappedSoABadHeaderCannotLockRefreshForHours() =
        runBlocking {
            val auth =
                manager {
                    respondError(HttpStatusCode.TooManyRequests, headers = headersOf(HttpHeaders.RetryAfter, "86400"))
                }

            auth.refreshToken()
            now += 299_999
            auth.refreshToken()
            assertEquals(1, requests)

            now += 1
            auth.refreshToken()
            assertEquals(2, requests)
        }

    @Test
    fun serverErrorsBackOffExponentially() =
        runBlocking {
            val auth = manager { respondError(HttpStatusCode.BadGateway) }

            auth.refreshToken()
            assertEquals(1, requests)
            now += 1_999
            auth.refreshToken()
            assertEquals(1, requests)

            now += 1
            auth.refreshToken()
            assertEquals(2, requests)
            now += 3_999
            auth.refreshToken()
            assertEquals(2, requests)

            now += 1
            auth.refreshToken()
            assertEquals(3, requests)
            assertEquals("old-refresh", stored["refresh_token"])
            assertEquals(AuthState.Authenticated, auth.authState.value)
        }

    @Test
    fun theBackoffNeverExceedsAMinute() =
        runBlocking {
            val auth = manager { respondError(HttpStatusCode.ServiceUnavailable) }

            repeat(12) {
                auth.refreshToken()
                now += 60_000
            }
            auth.refreshToken()
            val before = requests

            now += 59_999
            auth.refreshToken()
            assertEquals(before, requests)

            now += 1
            auth.refreshToken()
            assertEquals(before + 1, requests)
        }

    @Test
    fun aTransportFailureBlocksTheNextAttemptButKeepsTheTokens() =
        runBlocking {
            val auth = manager { throw IOException("offline") }

            assertFalse(auth.refreshToken())
            assertFalse(auth.refreshToken())

            assertEquals(1, requests)
            assertEquals("old-access", stored["access_token"])
            assertEquals("old-refresh", stored["refresh_token"])
            assertEquals(AuthState.Authenticated, auth.authState.value)
        }

    @Test
    fun aSuccessfulRefreshResetsTheBackoff() =
        runBlocking {
            var fail = true
            val auth = manager { if (fail) respondError(HttpStatusCode.BadGateway) else tokens() }

            auth.refreshToken()
            now += 2_000
            auth.refreshToken()
            assertEquals(2, requests)

            fail = false
            now += 4_000
            assertTrue(auth.refreshToken())
            assertEquals(3, requests)

            fail = true
            stored["access_token"] = "expired-again"
            assertFalse(auth.refreshToken())
            assertEquals(4, requests)

            now += 2_000
            auth.refreshToken()
            assertEquals(5, requests)
        }

    @Test
    fun aDefinitiveRejectionEndsTheSessionAndDropsTheTokens() =
        runBlocking {
            val auth = manager { respondError(HttpStatusCode.Unauthorized) }

            assertFalse(auth.refreshToken())

            assertNull(stored["access_token"])
            assertNull(stored["refresh_token"])
            assertEquals(AuthState.SessionExpired, auth.authState.value)
        }

    @Test
    fun noRefreshTokenMeansNoRequest() =
        runBlocking {
            stored.remove("refresh_token")
            val auth = manager { tokens() }

            assertFalse(auth.refreshToken())

            assertEquals(0, requests)
        }

    @Test
    fun logoutClearsTheBlockSoTheNextSignInRefreshesImmediately() =
        runBlocking {
            var limited = true
            val auth = manager { if (limited) respondError(HttpStatusCode.TooManyRequests) else tokens() }
            auth.refreshToken()

            auth.logout()
            limited = false
            stored["access_token"] = "signed-in-again"
            stored["refresh_token"] = "fresh-refresh"
            assertTrue(auth.refreshToken())

            assertEquals(2, requests)
        }
}
