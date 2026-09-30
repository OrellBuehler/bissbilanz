package com.bissbilanz.api

import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementChecklistItem
import com.bissbilanz.api.generated.model.SupplementChecklistResponse
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementHistoryResponse
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.api.generated.model.SupplementLogResponse
import com.bissbilanz.api.generated.model.SupplementResponse
import com.bissbilanz.api.generated.model.SupplementsListResponse
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface SupplementsApi : ApiTransport {
    suspend fun getSupplements(): List<Supplement> {
        val response: SupplementsListResponse = get("/api/supplements")
        return response.supplements
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createSupplement(
        supplement: SupplementCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Supplement {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementResponse = post("/api/supplements", supplement, key, editedAt)
        return response.supplement
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteSupplement(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/supplements/$id", key, editedAt)
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SupplementLog {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementLogResponse =
            post("/api/supplements/$supplementId/log", mapOf("date" to date), key, editedAt)
        return response.log
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/supplements/$supplementId/log?date=$date", key, editedAt)
    }

    /** See [updateEntry] for what [clearedKeys] does. */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): Supplement {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementResponse =
            patchRawJson(
                "/api/supplements/$id",
                json.encodePartialUpdate(supplement, clearedKeys).toString(),
                key,
                editedAt,
            )
        return response.supplement
    }

    suspend fun getSupplementHistory(
        from: String,
        to: String,
    ): SupplementHistoryResponse =
        get("/api/supplements/history") {
            parameter("from", from)
            parameter("to", to)
        }

    suspend fun getAllSupplements(): SupplementsListResponse =
        get("/api/supplements") {
            parameter("all", true)
        }

    suspend fun getSupplementChecklist(date: String): List<SupplementChecklistItem> {
        val response: SupplementChecklistResponse = get("/api/supplements/$date/checklist")
        return response.checklist
    }
}
