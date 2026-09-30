package com.bissbilanz.api

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskAcknowledge
import com.bissbilanz.api.generated.model.AiTaskAcknowledgeResponse
import com.bissbilanz.api.generated.model.AiTaskCreate
import com.bissbilanz.api.generated.model.AiTaskPhotoResponse
import com.bissbilanz.api.generated.model.AiTaskResponse
import com.bissbilanz.api.generated.model.AiTaskUpdate
import com.bissbilanz.api.generated.model.AiTasksResponse
import com.bissbilanz.api.generated.model.McpStatusResponse
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** AI tasks: meals handed to the MCP assistant to log later. */
interface AiTasksApi : ApiTransport {
    @OptIn(ExperimentalUuidApi::class)
    suspend fun createAiTask(
        task: AiTaskCreate,
        idempotencyKey: String? = null,
    ): AiTask {
        val key = idempotencyKey ?: Uuid.random().toString()
        val response: AiTaskResponse = post("/api/ai-tasks", task, key, null)
        return response.task
    }

    suspend fun listAiTasks(
        status: String? = null,
        acknowledged: Boolean? = null,
        limit: Int? = null,
        offset: Int? = null,
    ): AiTasksResponse =
        get("/api/ai-tasks") {
            status?.let { parameter("status", it) }
            acknowledged?.let { parameter("acknowledged", it.toString()) }
            limit?.let { parameter("limit", it) }
            offset?.let { parameter("offset", it) }
        }

    /** See [updateEntry] for what [clearedKeys] does. */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateAiTask(
        id: String,
        update: AiTaskUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): AiTask {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: AiTaskResponse =
            patchRawJson(
                "/api/ai-tasks/$id",
                json.encodePartialUpdate(update, clearedKeys).toString(),
                key,
                editedAt,
            )
        return response.task
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteAiTask(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/ai-tasks/$id", key, editedAt)
    }

    /**
     * Clears the unread state on resolved tasks. Pass null to acknowledge every
     * unacknowledged task, which is what opening the list does.
     */
    suspend fun acknowledgeAiTasks(ids: List<String>? = null): Int {
        val response: AiTaskAcknowledgeResponse =
            post("/api/ai-tasks/acknowledge", AiTaskAcknowledge(ids = ids), null, null)
        return response.acknowledged
    }

    /**
     * Uploads every photo of one meal in a single request — the route reads
     * repeated `photo` parts and answers with the URLs in the order sent.
     */
    suspend fun uploadAiTaskPhotos(
        photos: List<Pair<String, ByteArray>>,
        contentType: String = "image/jpeg",
    ): List<String> {
        val response =
            client.submitFormWithBinaryData(
                url = "/api/ai-tasks/photo",
                formData =
                    formData {
                        photos.forEach { (fileName, fileBytes) ->
                            append(
                                "photo",
                                fileBytes,
                                Headers.build {
                                    append(HttpHeaders.ContentType, contentType)
                                    append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                                },
                            )
                        }
                    },
            ) {
                applyClientVersionHeaders(clientPlatform, clientVersion)
                header(HttpHeaders.Origin, baseUrl)
                // Several photos over a weak cellular uplink outlast the default 30s.
                timeout { requestTimeoutMillis = 120_000 }
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "POST /api/ai-tasks/photo failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
        val body: AiTaskPhotoResponse = response.body()
        return body.photoUrls
    }

    /**
     * Whether the signed-in account has at least one MCP client (Claude.ai, Claude
     * Code, ...) authorized. Queued AI tasks are only ever picked up by such a
     * client, so this is what gates "send to assistant" when the processor
     * preference is 'assistant' rather than the user's own iPhone.
     */
    suspend fun getMcpStatus(): Boolean {
        val response: McpStatusResponse = get("/api/mcp/status")
        return response.connected
    }
}
