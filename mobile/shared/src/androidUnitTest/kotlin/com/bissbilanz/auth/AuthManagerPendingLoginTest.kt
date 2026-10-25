package com.bissbilanz.auth

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The browser login can outlive the app process: Android may kill it while the Custom
 * Tab is in front. The callback then reaches a fresh [AuthManager], which must still
 * accept the state and send the PKCE verifier of the attempt that started it.
 */
class AuthManagerPendingLoginTest {
    private val stored = mutableMapOf<String, String>()
    private val secureStorage: SecureStorage = mockk(relaxed = true)
    private var tokenRequestBody: String? = null

    @BeforeTest
    fun setup() {
        every { secureStorage.load(any()) } answers { stored[firstArg()] }
        every { secureStorage.save(any(), any()) } answers { stored[firstArg()] = secondArg() }
        every { secureStorage.delete(any()) } answers { stored.remove(firstArg<String>()) }
    }

    private fun manager() =
        AuthManager(
            baseUrl = "https://test.example.com",
            secureStorage = secureStorage,
            engine =
                MockEngine { request ->
                    tokenRequestBody = (request.body as TextContent).text
                    respond(
                        content = """{"access_token":"a","refresh_token":"r","token_type":"Bearer","expires_in":3600}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
        )

    @Test
    fun aCallbackAfterProcessDeathStillCompletesTheLogin() =
        runBlocking {
            manager().buildLoginUrl("state-1")
            val verifier = assertNotNull(stored["oauth_pending_code_verifier"])
            val restarted = manager()

            assertTrue(restarted.validateState("state-1"))
            assertTrue(restarted.handleCallback("code-1"))

            val body = assertNotNull(tokenRequestBody)
            assertTrue(body.contains(verifier))
            assertEquals(AuthState.Authenticated, restarted.authState.value)
        }

    @Test
    fun aCompletedLoginLeavesNoPendingAttemptBehind() =
        runBlocking {
            val auth = manager()
            auth.buildLoginUrl("state-2")
            assertTrue(auth.validateState("state-2"))
            auth.handleCallback("code-2")

            assertFalse(manager().validateState("state-2"))
            assertFalse(stored.containsKey("oauth_pending_state"))
            assertFalse(stored.containsKey("oauth_pending_code_verifier"))
        }
}
