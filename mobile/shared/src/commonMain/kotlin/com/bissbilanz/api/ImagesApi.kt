package com.bissbilanz.api

import com.bissbilanz.api.generated.model.ImageUploadResponse
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*

/**
 * Image uploads. Both multipart uploads set Origin explicitly: the server's manual CSRF
 * check (`isOriginMismatch`) 403s any multipart/form-data POST without one, and only
 * browsers send it automatically.
 */
interface ImagesApi : ApiTransport {
    suspend fun uploadImage(
        fileName: String,
        fileBytes: ByteArray,
        contentType: String = "image/jpeg",
        purpose: String? = null,
    ): String {
        val response =
            client.submitFormWithBinaryData(
                url = "/api/images/upload",
                formData =
                    formData {
                        // `recipe_step` keeps the aspect ratio (up to 1280 px) instead of the
                        // square thumbnail every other image gets.
                        purpose?.let { append("purpose", it) }
                        // The route reads `formData.get('image')` — a mismatched
                        // field name is a 400 the client can't tell from a real one.
                        append(
                            "image",
                            fileBytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, contentType)
                                append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                            },
                        )
                    },
            ) {
                applyClientVersionHeaders(clientPlatform, clientVersion)
                header(HttpHeaders.Origin, baseUrl)
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "POST /api/images/upload failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
        val body: ImageUploadResponse = response.body()
        return body.imageUrl
    }
}
