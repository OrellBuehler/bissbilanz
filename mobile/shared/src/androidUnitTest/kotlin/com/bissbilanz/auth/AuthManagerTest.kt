package com.bissbilanz.auth

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AuthManagerTest {
    private lateinit var secureStorage: SecureStorage
    private lateinit var authManager: AuthManager

    @BeforeTest
    fun setup() {
        secureStorage = mockk(relaxed = true)
        authManager =
            AuthManager(
                baseUrl = "https://test.example.com",
                clientId = "test-client-id",
                secureStorage = secureStorage,
            )
    }

    @Test
    fun initializeSetsAuthenticatedWhenTokenExists() {
        every { secureStorage.load("access_token") } returns "existing-token"
        authManager.initialize()
        assertEquals(AuthState.Authenticated, authManager.authState.value)
    }

    @Test
    fun initializeStaysUnauthenticatedWhenNoToken() {
        every { secureStorage.load("access_token") } returns null
        authManager.initialize()
        assertEquals(AuthState.Unauthenticated, authManager.authState.value)
    }

    @Test
    fun initialStateIsUnauthenticated() {
        assertEquals(AuthState.Unauthenticated, authManager.authState.value)
    }

    @Test
    fun validateStateReturnsTrueForMatchingState() {
        authManager.buildAuthorizationUrl("test-state-123")
        assertTrue(authManager.validateState("test-state-123"))
    }

    @Test
    fun validateStateReturnsFalseForNonMatchingState() {
        authManager.buildAuthorizationUrl("expected-state")
        assertFalse(authManager.validateState("wrong-state"))
    }

    @Test
    fun validateStateReturnsFalseWhenNoPendingState() {
        assertFalse(authManager.validateState("any-state"))
    }

    @Test
    fun validateStateReturnsFalseForNullState() {
        authManager.buildAuthorizationUrl("some-state")
        assertFalse(authManager.validateState(null))
    }

    @Test
    fun validateStateClearsPendingStateAfterCheck() {
        authManager.buildAuthorizationUrl("one-time-state")
        assertTrue(authManager.validateState("one-time-state"))
        assertFalse(authManager.validateState("one-time-state"))
    }

    @Test
    fun logoutClearsTokensAndSetsUnauthenticated() {
        every { secureStorage.load("access_token") } returns "token"
        authManager.initialize()
        assertEquals(AuthState.Authenticated, authManager.authState.value)

        authManager.logout()

        verify { secureStorage.delete("access_token") }
        verify { secureStorage.delete("refresh_token") }
        assertEquals(AuthState.Unauthenticated, authManager.authState.value)
    }

    @Test
    fun buildAuthorizationUrlContainsRequiredParameters() {
        val url = authManager.buildAuthorizationUrl("my-state")
        assertTrue(url.startsWith("https://test.example.com/api/oauth/authorize?"))
        assertTrue(url.contains("response_type=code"))
        assertTrue(url.contains("client_id=test-client-id"))
        assertTrue(url.contains("state=my-state"))
        assertTrue(url.contains("code_challenge_method=S256"))
        assertTrue(url.contains("code_challenge="))
        assertTrue(url.contains("redirect_uri="))
    }

    @Test
    fun buildAuthorizationUrlGeneratesDifferentChallengesEachTime() {
        val url1 = authManager.buildAuthorizationUrl("state1")
        val url2 = authManager.buildAuthorizationUrl("state2")
        val challenge1 = extractParam(url1, "code_challenge")
        val challenge2 = extractParam(url2, "code_challenge")
        assertTrue(challenge1 != challenge2)
    }

    @Test
    fun getAccessTokenDelegatesToSecureStorage() =
        runTest {
            every { secureStorage.load("access_token") } returns "my-token"
            assertEquals("my-token", authManager.getAccessToken())
        }

    @Test
    fun getAccessTokenReturnsNullWhenNoToken() =
        runTest {
            every { secureStorage.load("access_token") } returns null
            assertEquals(null, authManager.getAccessToken())
        }

    @Test
    fun handleCallbackReturnsFalseWithoutCodeVerifier() =
        runTest {
            assertFalse(authManager.handleCallback("some-code"))
        }

    private fun extractParam(
        url: String,
        param: String,
    ): String? {
        val regex = Regex("$param=([^&]+)")
        return regex.find(url)?.groupValues?.get(1)
    }
}
