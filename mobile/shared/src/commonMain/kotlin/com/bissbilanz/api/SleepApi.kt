package com.bissbilanz.api

import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntriesResponse
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepEntryResponse
import com.bissbilanz.api.generated.model.SleepUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface SleepApi : ApiTransport {
    suspend fun getSleepEntries(
        from: String? = null,
        to: String? = null,
    ): List<SleepEntry> {
        val response: SleepEntriesResponse =
            get("/api/sleep") {
                from?.let { parameter("from", it) }
                to?.let { parameter("to", it) }
            }
        return response.propertyEntries
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createSleepEntry(
        entry: SleepCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SleepEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SleepEntryResponse = post("/api/sleep", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateSleepEntry(
        id: String,
        entry: SleepUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SleepEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SleepEntryResponse = patch("/api/sleep/$id", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteSleepEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/sleep/$id", key, editedAt)
    }
}
