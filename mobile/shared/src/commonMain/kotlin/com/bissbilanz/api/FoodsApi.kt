package com.bissbilanz.api

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodBrandStat
import com.bissbilanz.api.generated.model.FoodBrandsResponse
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodDuplicateGroup
import com.bissbilanz.api.generated.model.FoodDuplicatesResponse
import com.bissbilanz.api.generated.model.FoodIdsResponse
import com.bissbilanz.api.generated.model.FoodLabelStat
import com.bissbilanz.api.generated.model.FoodLabelStatsResponse
import com.bissbilanz.api.generated.model.FoodLabelsSet
import com.bissbilanz.api.generated.model.FoodLabelsSetResponse
import com.bissbilanz.api.generated.model.FoodMerge
import com.bissbilanz.api.generated.model.FoodMergeOverrides
import com.bissbilanz.api.generated.model.FoodRecent
import com.bissbilanz.api.generated.model.FoodResponse
import com.bissbilanz.api.generated.model.FoodUsageResponse
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.FoodsRecentResponse
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.OpenFoodFactsResponse
import com.bissbilanz.api.generated.model.OpenFoodFactsSearchResponse
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface FoodsApi : ApiTransport {
    suspend fun getFoodsPaginated(
        limit: Int = 20,
        offset: Int = 0,
    ): FoodsListResponse =
        get("/api/foods") {
            parameter("limit", limit)
            parameter("offset", offset)
        }

    suspend fun getFoods(
        limit: Int = 100,
        offset: Int = 0,
    ): List<Food> = getFoodsPaginated(limit, offset).foods

    /**
     * One page of the server's write-ordered change feed: foods written after
     * [modifiedSince] on the first call, then after [after] (the previous page's
     * `nextCursor`). `nextCursor` is null once the feed is exhausted.
     */
    suspend fun getFoodsDelta(
        modifiedSince: String? = null,
        after: String? = null,
        limit: Int = 1000,
    ): FoodsListResponse =
        get("/api/foods") {
            parameter("limit", limit)
            if (after != null) parameter("after", after) else parameter("modifiedSince", modifiedSince ?: "1970-01-01T00:00:00Z")
        }

    suspend fun getFoodIds(): List<String> {
        val response: FoodIdsResponse = get("/api/foods/ids")
        return response.ids
    }

    suspend fun getFoodUsage(id: String): FoodUsageResponse = get("/api/foods/$id/usage")

    suspend fun getFood(id: String): Food {
        val response: FoodResponse = get("/api/foods/$id")
        return response.food
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createFood(
        food: FoodCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = post("/api/foods", food, key, editedAt)
        return response.food
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateFood(
        id: String,
        food: FoodCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = patch("/api/foods/$id", food, key, editedAt)
        return response.food
    }

    /**
     * Flips only the favorite flag. A partial PATCH rather than a full food body,
     * so a stale client can never overwrite nutrients it did not intend to touch.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun toggleFavorite(
        id: String,
        isFavorite: Boolean,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = patch("/api/foods/$id", FavoritePatch(isFavorite), key, editedAt)
        return response.food
    }

    /** Attaches or (with a null [imageUrl]) removes a food's image. */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun setFoodImage(
        id: String,
        imageUrl: String?,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = patch("/api/foods/$id", ImagePatch(imageUrl), key, editedAt)
        return response.food
    }

    /**
     * Replaces the user's labels for a food. Source defaults to `user` server-side,
     * which is what makes the write authoritative over anything a labeller seeded.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun setFoodLabels(
        id: String,
        labels: List<String>,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): FoodLabelsSetResponse {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        return put("/api/foods/$id/labels", FoodLabelsSet(labels = labels), key, editedAt)
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteFood(
        id: String,
        force: Boolean = false,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete(if (force) "/api/foods/$id?force=true" else "/api/foods/$id", key, editedAt)
    }

    suspend fun searchFoods(query: String): List<Food> {
        val response: FoodsListResponse = get("/api/foods") { parameter("q", query) }
        return response.foods
    }

    /**
     * Merges [sourceIds] into [keeperId]: every food_entries/recipe_ingredients/
     * supplement_ingredients row referencing a source is re-pointed to the keeper and
     * the source rows are permanently deleted server-side (`src/lib/server/
     * food-merge.ts`). Returns the merged keeper.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun mergeFoods(
        keeperId: String,
        sourceIds: List<String>,
        overrides: FoodMergeOverrides? = null,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse =
            post(
                "/api/foods/merge",
                FoodMerge(keeperId = keeperId, sourceIds = sourceIds, overrides = overrides),
                key,
                editedAt,
            )
        return response.food
    }

    /** Candidate duplicate groups across the user's whole food set (`src/lib/server/food-duplicates.ts`). */
    suspend fun getFoodDuplicates(): List<FoodDuplicateGroup> {
        val response: FoodDuplicatesResponse = get("/api/foods/duplicates")
        return response.groups
    }

    suspend fun getRecentFoods(limit: Int = 20): List<FoodRecent> {
        val response: FoodsRecentResponse = get("/api/foods/recent") { parameter("limit", limit) }
        return response.foods
    }

    suspend fun getFavorites(): List<Food> {
        val response: FoodFavoritesResponse = get("/api/favorites") { parameter("type", "foods") }
        return response.foods ?: emptyList()
    }

    suspend fun getFoodByBarcode(barcode: String): Food? =
        try {
            // The barcode filter answers with the list envelope (`{ foods, total }`),
            // not a single `{ food }`.
            val response: FoodsListResponse = get("/api/foods") { parameter("barcode", barcode) }
            response.foods.firstOrNull()
        } catch (e: ApiException) {
            // A barcode the server rejects (e.g. a non-numeric code) simply has no match.
            if (e.statusCode !in 400..499) throw e
            null
        }

    /**
     * Null only when Open Food Facts does not know the barcode (404). Every other
     * failure — offline, 5xx, a response the generated model cannot decode —
     * propagates so callers can report it instead of showing "not found".
     */
    suspend fun lookupOpenFoodFacts(barcode: String): OpenFoodFactsProduct? =
        try {
            val response: OpenFoodFactsResponse = get("/api/openfoodfacts/$barcode")
            response.product
        } catch (e: ApiException) {
            if (e.statusCode == 404) null else throw e
        }

    suspend fun searchOpenFoodFacts(
        query: String,
        limit: Int = 10,
    ): List<OpenFoodFactsProduct> {
        val response: OpenFoodFactsSearchResponse =
            get("/api/openfoodfacts/search") {
                parameter("q", query)
                parameter("limit", limit)
            }
        return response.results
    }

    suspend fun getFoodBrands(): List<FoodBrandStat> {
        val response: FoodBrandsResponse = get("/api/foods/brands")
        return response.brands
    }

    suspend fun getFoodLabelStats(kind: String? = "food"): List<FoodLabelStat> {
        val response: FoodLabelStatsResponse =
            get("/api/foods/labels") { if (kind != null) parameter("kind", kind) }
        return response.labels
    }
}

@kotlinx.serialization.Serializable
private data class FavoritePatch(
    val isFavorite: Boolean,
)

/**
 * The image URL alone. `imageUrl` carries a `= null` default on [FoodCreate]
 * (and on [RecipeCreate]/[RecipeUpdate]) and `encodeDefaults = false`, so a
 * removal sent through those bodies is simply dropped and the old image stays.
 * This property has no default, so its null is always written — which is what
 * makes removal reach the server.
 */
@kotlinx.serialization.Serializable
internal data class ImagePatch(
    val imageUrl: String?,
)

@kotlinx.serialization.Serializable
private data class FoodFavoritesResponse(
    val foods: List<Food>? = null,
)
