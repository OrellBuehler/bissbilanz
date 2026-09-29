package com.bissbilanz.api

import com.bissbilanz.api.generated.model.Reminder
import com.bissbilanz.api.generated.model.ReminderCreate
import com.bissbilanz.api.generated.model.ReminderResponse
import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.api.generated.model.RemindersListResponse
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface RemindersApi : ApiTransport {
    suspend fun getReminders(): List<Reminder> {
        val response: RemindersListResponse = get("/api/reminders")
        return response.reminders
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createReminder(
        reminder: ReminderCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Reminder {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: ReminderResponse = post("/api/reminders", reminder, key, editedAt)
        return response.reminder
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateReminder(
        id: String,
        reminder: ReminderUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Reminder {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: ReminderResponse = patch("/api/reminders/$id", reminder, key, editedAt)
        return response.reminder
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteReminder(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/reminders/$id", key, editedAt)
    }
}
