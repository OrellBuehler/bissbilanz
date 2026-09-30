package com.bissbilanz.api

import com.bissbilanz.api.generated.model.AccountResponse
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.http.*

interface AccountApi : ApiTransport {
    suspend fun getAccount(): AccountResponse = get("/api/account")

    suspend fun deleteAccount() = delete("/api/account")

    /** Downloads an authenticated server-relative file (e.g. an /uploads/ image) as raw bytes. */
    suspend fun downloadFile(path: String): ByteArray = get(path)

    suspend fun exportAccountData(): ByteArray =
        get("/api/account/export") {
            // Full-account archive incl. photos — allow more than the default 30s
            timeout { requestTimeoutMillis = 120_000 }
        }

    /**
     * [url] may be a third-party host (e.g. an Open Food Facts product image) rather
     * than [baseUrl], so the client version headers are only attached when it matches —
     * never send them anywhere but the Bissbilanz API.
     */
    suspend fun downloadBytes(url: String): ByteArray {
        val response =
            client.get(url) {
                if (Url(url).host == Url(baseUrl).host) applyClientVersionHeaders(clientPlatform, clientVersion)
            }
        if (!response.status.isSuccess()) {
            throw ApiException("GET $url failed: HTTP ${response.status.value}", response.status.value)
        }
        return response.body()
    }
}
