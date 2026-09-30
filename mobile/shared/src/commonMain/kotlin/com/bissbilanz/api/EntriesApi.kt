package com.bissbilanz.api

import com.bissbilanz.api.generated.model.EntriesCopyResponse
import com.bissbilanz.api.generated.model.EntriesListResponse
import com.bissbilanz.api.generated.model.EntriesRangeResponse
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryRangeItem
import com.bissbilanz.api.generated.model.EntryResponse
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.model.Entry
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface EntriesApi : ApiTransport {
    suspend fun getEntries(date: String): List<Entry> {
        val response: EntriesListResponse = get("/api/entries") { parameter("date", date) }
        return response.propertyEntries.map { item ->
            Entry(
                id = item.id,
                date = date,
                mealType = item.mealType,
                servings = item.servings,
                notes = item.notes,
                foodId = item.foodId,
                recipeId = item.recipeId,
                quickName = item.quickName,
                quickCalories = item.quickCalories,
                quickProtein = item.quickProtein,
                quickCarbs = item.quickCarbs,
                quickFat = item.quickFat,
                quickFiber = item.quickFiber,
                quickNutrients = item.quickNutrients,
                eatenAt = item.eatenAt,
                createdAt = item.createdAt,
                foodName = item.foodName,
                calories = item.calories,
                protein = item.protein,
                carbs = item.carbs,
                fat = item.fat,
                fiber = item.fiber,
                imageUrl = item.imageUrl,
                servingSize = item.servingSize,
                servingUnit = item.servingUnit?.value,
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createEntry(
        entry: EntryCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Entry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: EntryResponse = post("/api/entries", entry, key, editedAt)
        val e = response.entry
        return Entry(
            id = e.id,
            userId = e.userId,
            foodId = e.foodId,
            recipeId = e.recipeId,
            date = e.date,
            mealType = e.mealType,
            servings = e.servings,
            notes = e.notes,
            quickName = e.quickName,
            quickCalories = e.quickCalories,
            quickProtein = e.quickProtein,
            quickCarbs = e.quickCarbs,
            quickFat = e.quickFat,
            quickFiber = e.quickFiber,
            quickNutrients = e.quickNutrients,
            eatenAt = e.eatenAt,
            createdAt = e.createdAt,
            updatedAt = e.updatedAt,
        )
    }

    /**
     * [clearedKeys] names the fields the caller is deliberately emptying; they are sent
     * as explicit JSON nulls so the server clears the column instead of keeping it.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): Entry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: EntryResponse =
            patchRawJson(
                "/api/entries/$id",
                json.encodePartialUpdate(entry, clearedKeys).toString(),
                key,
                editedAt,
            )
        val e = response.entry
        return Entry(
            id = e.id,
            userId = e.userId,
            foodId = e.foodId,
            recipeId = e.recipeId,
            date = e.date,
            mealType = e.mealType,
            servings = e.servings,
            notes = e.notes,
            quickName = e.quickName,
            quickCalories = e.quickCalories,
            quickProtein = e.quickProtein,
            quickCarbs = e.quickCarbs,
            quickFat = e.quickFat,
            quickFiber = e.quickFiber,
            quickNutrients = e.quickNutrients,
            eatenAt = e.eatenAt,
            createdAt = e.createdAt,
            updatedAt = e.updatedAt,
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/entries/$id", key, editedAt)
    }

    suspend fun getEntriesRange(
        startDate: String,
        endDate: String,
    ): List<EntryRangeItem> {
        val response: EntriesRangeResponse =
            get("/api/entries/range") {
                parameter("startDate", startDate)
                parameter("endDate", endDate)
            }
        return response.propertyEntries
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): EntriesCopyResponse =
        post("/api/entries/copy", mapOf<String, String>()) {
            parameter("fromDate", fromDate)
            parameter("toDate", toDate)
        }
}
