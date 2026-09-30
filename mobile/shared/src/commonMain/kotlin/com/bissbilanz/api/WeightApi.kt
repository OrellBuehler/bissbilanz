package com.bissbilanz.api

import com.bissbilanz.api.generated.model.WeightCreate
import com.bissbilanz.api.generated.model.WeightEntriesResponse
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.api.generated.model.WeightEntryResponse
import com.bissbilanz.api.generated.model.WeightLatestResponse
import com.bissbilanz.api.generated.model.WeightTrendEntry
import com.bissbilanz.api.generated.model.WeightTrendResponse
import com.bissbilanz.api.generated.model.WeightUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface WeightApi : ApiTransport {
    suspend fun getWeightEntries(limit: Int = 30): List<WeightEntry> {
        val response: WeightEntriesResponse = get("/api/weight") { parameter("limit", limit) }
        return response.propertyEntries
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createWeightEntry(
        entry: WeightCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): WeightEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: WeightEntryResponse = post("/api/weight", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateWeightEntry(
        id: String,
        entry: WeightUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): WeightEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: WeightEntryResponse = patch("/api/weight/$id", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteWeightEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/weight/$id", key, editedAt)
    }

    suspend fun getLatestWeightEntry(): WeightEntry? {
        val response: WeightLatestResponse = get("/api/weight/latest")
        return response.entry
    }

    suspend fun getWeightTrend(
        from: String,
        to: String,
    ): List<WeightTrendEntry> {
        val response: WeightTrendResponse =
            get("/api/weight") {
                parameter("from", from)
                parameter("to", to)
            }
        return response.`data`
    }
}
