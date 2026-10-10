package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import com.bissbilanz.createHttpEngine
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.url
import io.ktor.http.ContentType
import io.ktor.http.Url
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * The Bissbilanz HTTP API. The endpoints live in the per-domain interfaces below (one file
 * each); this class owns the HTTP client and mixes them together.
 */
class BissbilanzApi(
    override val baseUrl: String,
    authManager: AuthManager,
    override val json: Json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
            isLenient = true
        },
    override val clientPlatform: String = "android",
    override val clientVersion: String? = null,
    updateGate: UpdateGate = UpdateGate(),
    engine: HttpClientEngine = createHttpEngine(),
) : AccountApi,
    FoodsApi,
    EntriesApi,
    RecipesApi,
    PreferencesApi,
    WeightApi,
    FastingApi,
    SupplementsApi,
    StatsApi,
    DayPropertiesApi,
    SleepApi,
    RemindersApi,
    AiTasksApi,
    ImagesApi,
    FoodPackageApi {
    override val client =
        HttpClient(engine) {
            install(ContentNegotiation) {
                json(this@BissbilanzApi.json)
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
            }
            installUpdateGate(baseUrl, updateGate)
            install(Auth) {
                bearer {
                    loadTokens {
                        val token = authManager.getAccessToken() ?: return@loadTokens null
                        BearerTokens(token, "")
                    }
                    refreshTokens {
                        val current = authManager.getAccessToken()
                        if (current != null && current != oldTokens?.accessToken) {
                            return@refreshTokens BearerTokens(current, "")
                        }
                        if (!authManager.refreshToken()) throw UnauthorizedException()
                        val token = authManager.getAccessToken() ?: throw UnauthorizedException()
                        BearerTokens(token, "")
                    }
                    sendWithoutRequest { request ->
                        request.url.host == Url(baseUrl).host
                    }
                }
            }
            defaultRequest {
                url(baseUrl)
                contentType(ContentType.Application.Json)
            }
        }

    fun close() {
        client.close()
    }
}
