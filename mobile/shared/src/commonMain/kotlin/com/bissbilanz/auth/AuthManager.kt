package com.bissbilanz.auth

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
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
    private var pendingState: String? = null

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
    }

    fun initialize() {
        val token = secureStorage.load(KEY_ACCESS_TOKEN)
        if (token != null) {
            _authState.value = AuthState.Authenticated
        }
    }

    fun buildLoginUrl(state: String): String {
        pendingState = state
        return "$baseUrl/api/auth/mobile/login?state=$state"
    }

    fun validateState(state: String?): Boolean {
        val expected = pendingState
        pendingState = null
        return state != null && state == expected
    }

    suspend fun handleCallback(code: String): Boolean =
        try {
            val response: TokenResponse =
                client
                    .post("$baseUrl/api/auth/mobile/token") {
                        contentType(ContentType.Application.Json)
                        setBody(mapOf("code" to code))
                    }.body()

            secureStorage.save(KEY_ACCESS_TOKEN, response.accessToken)
            response.refreshToken?.let { secureStorage.save(KEY_REFRESH_TOKEN, it) }
            _authState.value = AuthState.Authenticated
            true
        } catch (e: Exception) {
            false
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
                        .post("$baseUrl/api/auth/mobile/token") {
                            contentType(ContentType.Application.Json)
                            setBody(mapOf("refresh_token" to refreshToken))
                        }.body()

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
}
