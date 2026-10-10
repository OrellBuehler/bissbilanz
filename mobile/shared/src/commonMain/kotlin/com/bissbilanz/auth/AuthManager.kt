package com.bissbilanz.auth

import com.bissbilanz.api.UpdateGate
import com.bissbilanz.api.applyClientVersionHeaders
import com.bissbilanz.api.installUpdateGate
import com.bissbilanz.util.Failures
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.HttpResponse
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
import kotlin.time.Clock

sealed class AuthState {
    data object Loading : AuthState()

    data object Unauthenticated : AuthState()

    data object Authenticated : AuthState()

    data object Refreshing : AuthState()

    data object SessionExpired : AuthState()
}

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
)

@Serializable
data class LoginProvidersResponse(
    val providers: List<String>,
)

class AuthManager(
    private val baseUrl: String,
    private val secureStorage: SecureStorage,
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val clientPlatform: String = "android",
    private val clientVersion: String? = null,
    private val updateGate: UpdateGate = UpdateGate(),
    engine: HttpClientEngine = com.bissbilanz.createHttpEngine(),
    private val nowMs: () -> Long = { Clock.System.now().toEpochMilliseconds() },
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val client =
        HttpClient(engine) {
            install(ContentNegotiation) {
                json(this@AuthManager.json)
            }
            installUpdateGate(baseUrl, updateGate)
            defaultRequest {
                applyClientVersionHeaders(clientPlatform, clientVersion)
            }
        }

    private val refreshMutex = Mutex()

    @Volatile
    private var refreshBlockedUntilMs = 0L

    @Volatile
    private var transientRefreshFailures = 0

    @Volatile
    private var pendingState: String? = null

    @Volatile
    private var pendingCodeVerifier: String? = null

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val REFRESH_BACKOFF_BASE_MS = 2_000L
        private const val REFRESH_BACKOFF_CAP_MS = 60_000L
        private const val DEFAULT_RETRY_AFTER_MS = 60_000L
        private const val MAX_RETRY_AFTER_MS = 300_000L
        private const val MIN_RETRY_AFTER_MS = 1_000L
    }

    fun initialize() {
        val token = secureStorage.load(KEY_ACCESS_TOKEN)
        _authState.value = if (token != null) AuthState.Authenticated else AuthState.Unauthenticated
    }

    fun injectTestToken(token: String) {
        secureStorage.save(KEY_ACCESS_TOKEN, token)
        _authState.value = AuthState.Authenticated
    }

    fun buildLoginUrl(
        state: String,
        provider: String = "infomaniak",
    ): String {
        val verifier = Pkce.generateVerifier()
        pendingState = state
        pendingCodeVerifier = verifier
        val challenge = Pkce.challengeFor(verifier)
        return "$baseUrl/api/auth/mobile/login?state=$state&provider=$provider" +
            "&code_challenge=$challenge&code_challenge_method=S256"
    }

    /** Which sign-in providers the server has configured, or null when the request fails. */
    suspend fun fetchLoginProviders(): List<String>? =
        try {
            val response: LoginProvidersResponse = client.get("$baseUrl/api/auth/providers").body()
            response.providers
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Failures.report(e)
            null
        }

    fun validateState(state: String?): Boolean {
        val expected = pendingState
        // Only a matching callback consumes the login attempt: a stray or forged
        // callback URL must not cancel the login the user is in the middle of.
        val valid = state != null && expected != null && state == expected
        if (valid) pendingState = null
        return valid
    }

    suspend fun handleCallback(code: String): Boolean {
        val codeVerifier = pendingCodeVerifier
        pendingCodeVerifier = null
        return try {
            val httpResponse =
                client.post("$baseUrl/api/auth/mobile/token") {
                    contentType(ContentType.Application.Json)
                    setBody(listOfNotNull("code" to code, codeVerifier?.let { "code_verifier" to it }).toMap())
                }
            if (!httpResponse.status.isSuccess()) return false
            val response: TokenResponse = httpResponse.body()

            secureStorage.save(KEY_ACCESS_TOKEN, response.accessToken)
            response.refreshToken?.let { secureStorage.save(KEY_REFRESH_TOKEN, it) }
            clearRefreshBlock()
            _authState.value = AuthState.Authenticated
            true
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Failures.report(e)
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

            if (nowMs() < refreshBlockedUntilMs) return@withLock false

            val refreshToken = secureStorage.load(KEY_REFRESH_TOKEN) ?: return@withLock false

            val stateBeforeRefresh = _authState.value
            _authState.value = AuthState.Refreshing
            try {
                val httpResponse =
                    client.post("$baseUrl/api/auth/mobile/token") {
                        contentType(ContentType.Application.Json)
                        setBody(mapOf("refresh_token" to refreshToken))
                    }

                val status = httpResponse.status.value

                // Only an explicit rejection of the refresh token ends the session.
                // A 5xx (server down, proxy 502) is transient: keep the tokens and let
                // the next API call retry. Mirrors iosApp/API/AuthManager.performRefresh.
                if (status == 400 || status == 401 || status == 403) {
                    secureStorage.delete(KEY_ACCESS_TOKEN)
                    secureStorage.delete(KEY_REFRESH_TOKEN)
                    clearRefreshBlock()
                    _authState.value = AuthState.SessionExpired
                    return@withLock false
                }

                if (status !in 200..299) {
                    blockRefresh(if (status == 429) retryAfterMs(httpResponse) else null)
                    _authState.compareAndSet(AuthState.Refreshing, stateBeforeRefresh)
                    return@withLock false
                }

                val response: TokenResponse = httpResponse.body()
                secureStorage.save(KEY_ACCESS_TOKEN, response.accessToken)
                response.refreshToken?.let { secureStorage.save(KEY_REFRESH_TOKEN, it) }
                clearRefreshBlock()
                _authState.value = AuthState.Authenticated
                true
            } catch (e: Exception) {
                // Transport-level failure (offline, DNS, timeout) or a malformed body —
                // never the server rejecting the token, which is handled above. Keeping
                // the tokens means a network hiccup can't permanently sign the user out;
                // the caller's request fails and the next one retries the refresh.
                // compareAndSet so a logout() or initialize() that raced this refresh
                // keeps the state it just set.
                _authState.compareAndSet(AuthState.Refreshing, stateBeforeRefresh)
                if (e is kotlinx.coroutines.CancellationException) throw e
                blockRefresh(null)
                Failures.report(e)
                false
            }
        }
    }

    private fun retryAfterMs(response: HttpResponse): Long {
        val seconds = response.headers[HttpHeaders.RetryAfter]?.trim()?.toLongOrNull()
        return if (seconds != null && seconds > 0) {
            (seconds * 1000).coerceIn(MIN_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS)
        } else {
            DEFAULT_RETRY_AFTER_MS
        }
    }

    private fun blockRefresh(serverRetryAfterMs: Long?) {
        transientRefreshFailures++
        val delayMs =
            serverRetryAfterMs
                ?: minOf(
                    REFRESH_BACKOFF_BASE_MS shl (transientRefreshFailures - 1).coerceAtMost(10),
                    REFRESH_BACKOFF_CAP_MS,
                )
        refreshBlockedUntilMs = nowMs() + delayMs
    }

    private fun clearRefreshBlock() {
        transientRefreshFailures = 0
        refreshBlockedUntilMs = 0L
    }

    fun clearSessionExpired() {
        if (_authState.value is AuthState.SessionExpired) {
            _authState.value = AuthState.Unauthenticated
        }
    }

    fun logout() {
        secureStorage.delete(KEY_ACCESS_TOKEN)
        secureStorage.delete(KEY_REFRESH_TOKEN)
        clearRefreshBlock()
        _authState.value = AuthState.Unauthenticated
    }

    fun close() {
        client.close()
    }
}
