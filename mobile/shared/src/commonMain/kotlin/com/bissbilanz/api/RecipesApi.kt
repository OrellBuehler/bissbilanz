package com.bissbilanz.api

import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeLabelsSet
import com.bissbilanz.api.generated.model.RecipeLabelsSetResponse
import com.bissbilanz.api.generated.model.RecipeResponse
import com.bissbilanz.api.generated.model.RecipeSummary
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.RecipeUsageResponse
import com.bissbilanz.api.generated.model.RecipesListResponse
import com.bissbilanz.util.encodePartialUpdate
import io.ktor.client.request.*
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

interface RecipesApi : ApiTransport {
    suspend fun getRecipeUsage(id: String): RecipeUsageResponse = get("/api/recipes/$id/usage")

    suspend fun getRecipes(): List<RecipeSummary> {
        val response: RecipesListResponse = get("/api/recipes")
        return response.recipes
    }

    suspend fun getRecipe(id: String): RecipeDetail {
        val response: RecipeResponse = get("/api/recipes/$id")
        return response.recipe
    }

    /**
     * Replaces the user's labels for a recipe. Source defaults to `user` server-side,
     * which is what makes the write authoritative over anything a labeller seeded.
     */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun setRecipeLabels(
        id: String,
        labels: List<String>,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): RecipeLabelsSetResponse {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        return put("/api/recipes/$id/labels", RecipeLabelsSet(labels = labels), key, editedAt)
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createRecipe(
        recipe: RecipeCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): RecipeDetail {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: RecipeResponse = post("/api/recipes", recipe, key, editedAt)
        return response.recipe
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        clearedKeys: Collection<String> = emptyList(),
    ): RecipeDetail {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: RecipeResponse =
            patchRawJson(
                "/api/recipes/$id",
                json.encodePartialUpdate(recipe, clearedKeys).toString(),
                key,
                editedAt,
            )
        return response.recipe
    }

    /** Attaches or (with a null [imageUrl]) removes a recipe's image. */
    @OptIn(ExperimentalUuidApi::class)
    suspend fun setRecipeImage(
        id: String,
        imageUrl: String?,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): RecipeDetail {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: RecipeResponse = patch("/api/recipes/$id", ImagePatch(imageUrl), key, editedAt)
        return response.recipe
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteRecipe(
        id: String,
        force: Boolean = false,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete(if (force) "/api/recipes/$id?force=true" else "/api/recipes/$id", key, editedAt)
    }
}
