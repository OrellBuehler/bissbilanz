package com.bissbilanz.api

import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.api.generated.model.GoalsResponse
import com.bissbilanz.api.generated.model.GoalsSetResponse
import com.bissbilanz.api.generated.model.MealType
import com.bissbilanz.api.generated.model.MealTypeCreate
import com.bissbilanz.api.generated.model.MealTypeResponse
import com.bissbilanz.api.generated.model.MealTypeUpdate
import com.bissbilanz.api.generated.model.MealTypesListResponse
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesResponse
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.util.Failures
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface PreferencesApi : ApiTransport {
    suspend fun getGoals(): Goals? =
        try {
            val response: GoalsResponse = get("/api/goals")
            response.goals
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (e !is ApiException || e.statusCode !in 400..499) Failures.report(e)
            null
        }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun setGoals(
        goals: Goals,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Goals {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: GoalsSetResponse = post("/api/goals", goals, key, editedAt)
        return response.goals
    }

    suspend fun getPreferences(): Preferences {
        val response: PreferencesResponse = get("/api/preferences")
        return response.preferences
    }

    /** See [updateEntry] for what [clearedKeys] does. */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun updatePreferences(
        prefs: PreferencesUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): Preferences {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: PreferencesResponse =
            patchRawJson(
                "/api/preferences",
                json.encodePartialUpdate(prefs, clearedKeys).toString(),
                key,
                editedAt,
            )
        return response.preferences
    }

    suspend fun getMealTypes(): MealTypesListResponse = get("/api/meal-types")

    suspend fun createMealType(mealType: MealTypeCreate): MealType = post("/api/meal-types", mealType)

    suspend fun updateMealType(
        id: String,
        mealType: MealTypeUpdate,
    ): MealType {
        val response: MealTypeResponse = patch("/api/meal-types/$id", mealType)
        return response.mealType
    }

    suspend fun deleteMealType(id: String) = delete("/api/meal-types/$id")
}
