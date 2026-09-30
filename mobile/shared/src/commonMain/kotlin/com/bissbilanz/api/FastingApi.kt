package com.bissbilanz.api

import com.bissbilanz.api.generated.model.FastingSession
import com.bissbilanz.api.generated.model.FastingSessionResponse
import com.bissbilanz.api.generated.model.FastingSessionUpsert
import com.bissbilanz.api.generated.model.FastingSessionsResponse
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface FastingApi : ApiTransport {
    suspend fun getFastingSessions(
        limit: Int = 60,
        from: String? = null,
        to: String? = null,
    ): List<FastingSession> {
        val response: FastingSessionsResponse =
            get("/api/fasts") {
                parameter("limit", limit)
                from?.let { parameter("from", it) }
                to?.let { parameter("to", it) }
            }
        return response.sessions
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun upsertFastingSession(
        session: FastingSessionUpsert,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): FastingSession {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FastingSessionResponse = post("/api/fasts", session, key, editedAt)
        return response.session
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteFastingSession(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/fasts/$id", key, editedAt)
    }
}
