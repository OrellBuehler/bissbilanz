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
        authManager.buildLoginUrl("test-state-123")
        assertTrue(authManager.validateState("test-state-123"))
    }

    @Test
    fun validateStateReturnsFalseForNonMatchingState() {
        authManager.buildLoginUrl("expected-state")
        assertFalse(authManager.validateState("wrong-state"))
    }

    @Test
    fun validateStateReturnsFalseWhenNoPendingState() {
        assertFalse(authManager.validateState("any-state"))
    }

    @Test
    fun validateStateReturnsFalseForNullState() {
        authManager.buildLoginUrl("some-state")
        assertFalse(authManager.validateState(null))
    }

    @Test
    fun validateStateClearsPendingStateAfterCheck() {
        authManager.buildLoginUrl("one-time-state")
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
    fun buildLoginUrlReturnsCorrectUrl() {
        val url = authManager.buildLoginUrl("my-state")
        assertEquals("https://test.example.com/api/auth/mobile/login?state=my-state", url)
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
}
