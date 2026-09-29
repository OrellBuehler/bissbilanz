package com.bissbilanz.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json

class ApiException(
    message: String,
    val statusCode: Int = 0,
    val rawResponse: HttpResponse? = null,
    /** Response body, when the caller needs to parse a structured error (e.g. a 409's counts). */
    val responseBody: String? = null,
) : Exception(message)

class UnauthorizedException : Exception("Not authenticated")

/**
 * What every per-domain API interface needs from [BissbilanzApi]: the shared HTTP
 * client plus the request helpers below. The domain interfaces carry their endpoints as
 * default methods and [BissbilanzApi] mixes them all together, so callers still see one
 * flat API.
 */
interface ApiTransport {
    val client: HttpClient
    val baseUrl: String
    val json: Json
    val clientPlatform: String
    val clientVersion: String?

    fun HttpRequestBuilder.applySyncHeaders(
        idempotencyKey: String?,
        clientEditedAt: String?,
    ) {
        applyClientVersionHeaders(clientPlatform, clientVersion)
        if (idempotencyKey != null) header("Idempotency-Key", idempotencyKey)
        if (clientEditedAt != null) header("X-Client-Edited-At", clientEditedAt)
    }
}

internal suspend inline fun <reified T> ApiTransport.get(
    path: String,
    crossinline block: HttpRequestBuilder.() -> Unit = {},
): T {
    val response =
        client.get(path) {
            applyClientVersionHeaders(clientPlatform, clientVersion)
            block()
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "GET $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

internal suspend inline fun <reified T> ApiTransport.post(
    path: String,
    body: Any,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
    block: HttpRequestBuilder.() -> Unit = {},
): T {
    val response =
        client.post(path) {
            setBody(body)
            applySyncHeaders(idempotencyKey, clientEditedAt)
            block()
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "POST $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

internal suspend inline fun <reified T> ApiTransport.put(
    path: String,
    body: Any,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
): T {
    val response =
        client.put(path) {
            setBody(body)
            applySyncHeaders(idempotencyKey, clientEditedAt)
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "PUT $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

internal suspend inline fun <reified T> ApiTransport.patch(
    path: String,
    body: Any,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
): T {
    val response =
        client.patch(path) {
            setBody(body)
            applySyncHeaders(idempotencyKey, clientEditedAt)
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "PATCH $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

/**
 * PUTs an already-serialized JSON body. Used by [DayPropertiesApi.setDayProperties], whose
 * endpoint is a PUT but is PATCH-style server-side: an omitted field keeps its stored value
 * and an explicit `null` clears it, so the request has to carry explicit nulls the
 * generated model serializer would otherwise drop (`encodeDefaults = false`).
 */
internal suspend inline fun <reified T> ApiTransport.putRawJson(
    path: String,
    body: String,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
): T {
    val response =
        client.put(path) {
            setBody(TextContent(body, ContentType.Application.Json))
            applySyncHeaders(idempotencyKey, clientEditedAt)
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "PUT $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

/**
 * PATCHes an already-serialized JSON body. Used by the partial updates that have to
 * send an explicit `null` to clear a field: routing those through the model
 * serializer would drop the nulls again (`encodeDefaults = false`).
 */
internal suspend inline fun <reified T> ApiTransport.patchRawJson(
    path: String,
    body: String,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
): T {
    val response =
        client.patch(path) {
            setBody(TextContent(body, ContentType.Application.Json))
            applySyncHeaders(idempotencyKey, clientEditedAt)
        }
    if (!response.status.isSuccess()) {
        throw ApiException(
            "PATCH $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
            response.status.value,
            response,
        )
    }
    return response.body()
}

internal suspend fun ApiTransport.delete(
    path: String,
    idempotencyKey: String? = null,
    clientEditedAt: String? = null,
) {
    val response =
        client.delete(path) {
            applySyncHeaders(idempotencyKey, clientEditedAt)
        }
    if (!response.status.isSuccess()) {
        val body = response.bodyAsText()
        throw ApiException(
            "DELETE $path failed: HTTP ${response.status.value} $body",
            response.status.value,
            response,
            body,
        )
    }
}
