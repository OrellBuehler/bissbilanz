package com.bissbilanz.auth

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.concurrent.Volatile
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.random.Random

sealed class AuthState {
    data object Unauthenticated : AuthState()

    data object Authenticated : AuthState()

    data object Refreshing : AuthState()
}

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
)

class AuthManager(
    private val baseUrl: String,
    private val clientId: String,
    private val secureStorage: SecureStorage,
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Unauthenticated)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val client =
        HttpClient(com.bissbilanz.createHttpEngine()) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }

    private val refreshMutex = Mutex()

    @Volatile
    private var codeVerifier: String? = null
    private var pendingState: String? = null

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val REDIRECT_URI = "bissbilanz://oauth/callback"
    }

    fun initialize() {
        val token = secureStorage.load(KEY_ACCESS_TOKEN)
        if (token != null) {
            _authState.value = AuthState.Authenticated
        }
    }

    @OptIn(ExperimentalEncodingApi::class)
    fun buildAuthorizationUrl(state: String): String {
        val verifier = generateCodeVerifier()
        codeVerifier = verifier
        pendingState = state
        val challenge = generateCodeChallenge(verifier)

        return "$baseUrl/api/oauth/authorize?" +
            "response_type=code&" +
            "client_id=$clientId&" +
            "redirect_uri=${REDIRECT_URI.encodeURLParameter()}&" +
            "state=$state&" +
            "code_challenge=$challenge&" +
            "code_challenge_method=S256"
    }

    fun validateState(state: String?): Boolean {
        val expected = pendingState
        pendingState = null
        return state != null && state == expected
    }

    suspend fun handleCallback(code: String): Boolean {
        val verifier = codeVerifier ?: return false
        codeVerifier = null

        return try {
            val response: TokenResponse =
                client
                    .submitForm(
                        url = "$baseUrl/api/oauth/token",
                        formParameters =
                            parameters {
                                append("grant_type", "authorization_code")
                                append("code", code)
                                append("redirect_uri", REDIRECT_URI)
                                append("client_id", clientId)
                                append("code_verifier", verifier)
                            },
                    ).body()

            secureStorage.save(KEY_ACCESS_TOKEN, response.accessToken)
            response.refreshToken?.let { secureStorage.save(KEY_REFRESH_TOKEN, it) }
            _authState.value = AuthState.Authenticated
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun getAccessToken(): String? = secureStorage.load(KEY_ACCESS_TOKEN)

    suspend fun refreshToken(): Boolean {
        val tokenBeforeLock = secureStorage.load(KEY_ACCESS_TOKEN)

        return refreshMutex.withLock {
            val tokenAfterLock = secureStorage.load(KEY_ACCESS_TOKEN)
            if (tokenAfterLock != null && tokenAfterLock != tokenBeforeLock) {
                return@withLock true
            }

            val refreshToken = secureStorage.load(KEY_REFRESH_TOKEN) ?: return@withLock false

            _authState.value = AuthState.Refreshing
            try {
                val response: TokenResponse =
                    client
                        .submitForm(
                            url = "$baseUrl/api/oauth/token",
                            formParameters =
                                parameters {
                                    append("grant_type", "refresh_token")
                                    append("refresh_token", refreshToken)
                                    append("client_id", clientId)
                                },
                        ).body()

                secureStorage.save(KEY_ACCESS_TOKEN, response.accessToken)
                response.refreshToken?.let { secureStorage.save(KEY_REFRESH_TOKEN, it) }
                _authState.value = AuthState.Authenticated
                true
            } catch (e: Exception) {
                _authState.value = AuthState.Unauthenticated
                false
            }
        }
    }

    fun logout() {
        secureStorage.delete(KEY_ACCESS_TOKEN)
        secureStorage.delete(KEY_REFRESH_TOKEN)
        _authState.value = AuthState.Unauthenticated
    }

    @OptIn(ExperimentalEncodingApi::class)
    private fun generateCodeVerifier(): String {
        val bytes = Random.nextBytes(32)
        return Base64.UrlSafe.encode(bytes).trimEnd('=')
    }

    @OptIn(ExperimentalEncodingApi::class)
    private fun generateCodeChallenge(verifier: String): String {
        val bytes = sha256(verifier.encodeToByteArray())
        return Base64.UrlSafe.encode(bytes).trimEnd('=')
    }
}

expect fun sha256(input: ByteArray): ByteArray
