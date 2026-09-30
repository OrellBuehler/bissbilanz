package com.bissbilanz.api

import com.bissbilanz.api.generated.model.FoodPackageImportResult
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageResolutions
import com.bissbilanz.api.generated.model.FoodPackageSelection
import com.bissbilanz.api.generated.model.FoodPackageSummaryResponse
import com.bissbilanz.foodpackage.filenameFromContentDisposition
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*

/** A food package the server exported, with the file name it wants it shared under. */
class FoodPackageDownload(
    val bytes: ByteArray,
    val fileName: String,
)

/**
 * Food packages (`src/lib/server/food-package/`): share foods + recipes with images as one zip; the importer re-uploads the same file with its choices.
 */
interface FoodPackageApi : ApiTransport {
    suspend fun summarizeFoodPackage(selection: FoodPackageSelection): FoodPackageSummaryResponse =
        post("/api/foods/package/summary", selection)

    /**
     * The package the server built and the file name it asked for (`.bissbilanz`, named after the
     * single recipe or food it holds). The name comes from `Content-Disposition`, preferring the
     * UTF-8 `filename*`.
     */
    suspend fun exportFoodPackage(selection: FoodPackageSelection): FoodPackageDownload {
        val response =
            client.post("/api/foods/package/export") {
                applyClientVersionHeaders(clientPlatform, clientVersion)
                setBody(selection)
                // Photos of a whole food database — allow more than the default 30s.
                timeout { requestTimeoutMillis = 180_000 }
            }
        if (!response.status.isSuccess()) {
            val body = response.bodyAsText()
            throw ApiException(
                "POST /api/foods/package/export failed: HTTP ${response.status.value} $body",
                response.status.value,
                responseBody = body,
            )
        }
        return FoodPackageDownload(
            bytes = response.body(),
            fileName = filenameFromContentDisposition(response.headers[HttpHeaders.ContentDisposition]),
        )
    }

    suspend fun previewFoodPackage(
        fileName: String,
        bytes: ByteArray,
    ): FoodPackagePreviewResponse = postFoodPackage("/api/foods/package/preview", fileName, bytes, null)

    /** Throws [ApiException] with status 409 when the preview is stale — re-run the preview. */
    suspend fun importFoodPackage(
        fileName: String,
        bytes: ByteArray,
        resolutions: FoodPackageResolutions,
    ): FoodPackageImportResult =
        postFoodPackage(
            "/api/foods/package/import",
            fileName,
            bytes,
            json.encodeToString(FoodPackageResolutions.serializer(), resolutions),
        )
}

private suspend inline fun <reified T> ApiTransport.postFoodPackage(
    path: String,
    fileName: String,
    bytes: ByteArray,
    resolutionsJson: String?,
): T {
    val response =
        client.submitFormWithBinaryData(
            url = path,
            formData =
                formData {
                    append(
                        "file",
                        bytes,
                        Headers.build {
                            append(HttpHeaders.ContentType, "application/zip")
                            append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                        },
                    )
                    if (resolutionsJson != null) {
                        append(
                            "resolutions",
                            resolutionsJson,
                            Headers.build { append(HttpHeaders.ContentType, "application/json") },
                        )
                    }
                },
        ) {
            applyClientVersionHeaders(clientPlatform, clientVersion)
            header(HttpHeaders.Origin, baseUrl)
            timeout { requestTimeoutMillis = 180_000 }
        }
    if (!response.status.isSuccess()) {
        val body = response.bodyAsText()
        throw ApiException(
            "POST $path failed: HTTP ${response.status.value} $body",
            response.status.value,
            responseBody = body,
        )
    }
    return response.body()
}
