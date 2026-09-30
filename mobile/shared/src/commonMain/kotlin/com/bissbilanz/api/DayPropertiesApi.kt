package com.bissbilanz.api

import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.api.generated.model.DayPropertiesRangeResponse
import com.bissbilanz.api.generated.model.DayPropertiesResponse
import com.bissbilanz.api.generated.model.DayPropertiesSet
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface DayPropertiesApi : ApiTransport {
    suspend fun getDayPropertiesRange(
        startDate: String,
        endDate: String,
    ): List<DayProperties> {
        val response: DayPropertiesRangeResponse =
            get("/api/day-properties") {
                parameter("startDate", startDate)
                parameter("endDate", endDate)
            }
        return response.data
    }

    suspend fun getDayProperties(date: String): DayProperties? {
        val response: DayPropertiesResponse = get("/api/day-properties") { parameter("date", date) }
        return response.properties
    }

    /**
     * PATCH-style: a `null` parameter that is also named in [clearedKeys] clears the
     * stored field; a `null` parameter that is not in [clearedKeys] is omitted from the
     * request and leaves the stored value untouched. See [com.bissbilanz.util.PartialUpdate].
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun setDayProperties(
        date: String,
        isFastingDay: Boolean? = null,
        notes: String? = null,
        waterMl: Int? = null,
        activityCalories: Int? = null,
        activityCaloriesSource: DayPropertiesSet.ActivityCaloriesSource? = null,
        activityNote: String? = null,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): DayProperties? {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val set =
            DayPropertiesSet(
                date = date,
                isFastingDay = isFastingDay,
                notes = notes,
                waterMl = waterMl,
                activityCalories = activityCalories,
                activityCaloriesSource = activityCaloriesSource,
                activityNote = activityNote,
            )
        val response: DayPropertiesResponse =
            putRawJson(
                "/api/day-properties",
                json.encodePartialUpdate(set, clearedKeys).toString(),
                key,
                editedAt,
            )
        return response.properties
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteDayProperties(
        date: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/day-properties?date=$date", key, editedAt)
    }
}
