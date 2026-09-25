package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.RecipeField
import com.bissbilanz.util.computeRecipePerServingMacros
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.jsonKeys
import com.bissbilanz.util.newTempId
import com.bissbilanz.util.serverTotalsToPerServing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

class RecipeRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    /** See `FoodRepository.onImageOrphaned`. */
    var onImageOrphaned: (suspend (String) -> Unit)? = null

    fun allRecipes(): Flow<List<RecipeDetail>> =
        db.userDataDatabaseQueries
            .selectAllRecipes()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<RecipeDetail>(it.jsonData) } }

    suspend fun refresh() {
        if (appModeManager.isLocal) return
        val summaries = api.getRecipes()
        val pendingIds = pendingRecipeIds()
        val queries = db.userDataDatabaseQueries
        // Keep optimistic temp-id creates and recipes carrying a queued update (a
        // queued delete already removed its row). A forced refresh right after a
        // recipe create/edit (the list screen calls refresh() on save) races the
        // async sync-queue upload; without this the summary list would wipe the
        // just-created recipe or resurrect a deleted one until the next refresh.
        val preserved =
            queries
                .selectAllRecipes()
                .executeAsList()
                .filter { it.id.isTempId() || it.id in pendingIds }
                .mapNotNull { json.decodeOrNull<RecipeDetail>(it.jsonData) }
        withContext(Dispatchers.IO) {
            queries.transaction {
                queries.deleteAllRecipes()
                summaries.forEach { s ->
                    if (s.id in pendingIds) return@forEach
                    val recipe =
                        RecipeDetail(
                            id = s.id,
                            userId = "",
                            name = s.name,
                            totalServings = s.totalServings,
                            isFavorite = s.isFavorite,
                            imageUrl = s.imageUrl,
                            calories = s.calories,
                            protein = s.protein,
                            carbs = s.carbs,
                            fat = s.fat,
                            fiber = s.fiber,
                            ingredients = emptyList(),
                        ).serverTotalsToPerServing()
                    queries.insertRecipe(
                        id = recipe.id,
                        name = recipe.name,
                        totalServings = recipe.totalServings,
                        isFavorite = if (recipe.isFavorite) 1L else 0L,
                        calories = recipe.calories,
                        protein = recipe.protein,
                        carbs = recipe.carbs,
                        fat = recipe.fat,
                        fiber = recipe.fiber,
                        jsonData = json.encodeToString(recipe),
                    )
                }
                preserved.forEach { cacheRecipe(it) }
            }
            // SyncMeta lives in the cache database; written after the user-data commit.
            cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "recipes",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    /** Recipe ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingRecipeIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "recipes" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    fun getRecipeCached(id: String): RecipeDetail? =
        db.userDataDatabaseQueries
            .selectRecipeById(id)
            .executeAsOneOrNull()
            ?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }

    suspend fun getRecipe(id: String): RecipeDetail {
        if (appModeManager.isLocal) {
            val cached = db.userDataDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
            return cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }
                ?: throw IllegalStateException("Recipe $id not found in local database")
        }
        return try {
            val recipe = api.getRecipe(id).serverTotalsToPerServing()
            withContext(Dispatchers.IO) { cacheRecipe(recipe) }
            recipe
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.userDataDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
            cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) } ?: throw e
        }
    }

    suspend fun createRecipe(recipe: RecipeCreate): RecipeDetail {
        val temp = recipeCreateToRecipe(recipe)
        withContext(Dispatchers.IO) { cacheRecipe(temp) }
        syncQueue.enqueue(SyncOperation.CreateRecipe(json.encodeToString(recipe), localId = temp.id))
        return temp
    }

    /**
     * Copies a recipe (ingredients, servings, cooked weight) under a new name, not
     * favorited, without its image — two recipes must never share one `imageUrl`,
     * since the server's `unlinkUpload` has no reference count and would delete the
     * file out from under whichever recipe keeps it once the other's image changes
     * or is deleted. Goes through [createRecipe] so it works offline the same way,
     * and returns a temp-id [RecipeDetail] the caller can immediately open for editing.
     */
    suspend fun duplicateRecipe(
        id: String,
        name: String,
    ): RecipeDetail {
        val source = getRecipe(id)
        return createRecipe(
            RecipeCreate(
                name = name,
                totalServings = source.totalServings,
                ingredients = source.ingredients.toIngredientInputs(),
                isFavorite = false,
                cookedWeight = source.cookedWeight,
            ),
        )
    }

    private fun List<RecipeIngredient>.toIngredientInputs(): List<RecipeIngredientInput> =
        map { ing ->
            RecipeIngredientInput(
                foodId = ing.foodId,
                quantity = ing.quantity,
                servingUnit = ServingUnit.valueOf(ing.servingUnit.name),
            )
        }

    /**
     * [cleared] names the fields the user deliberately emptied. `RecipeUpdate`
     * represents both "unchanged" and "cleared" as null, so without it a cleared
     * `cookedWeight` keeps its old value both here and on the server. See
     * `com.bissbilanz.util.PartialUpdate`.
     */
    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
        cleared: Set<RecipeField> = emptySet(),
    ): RecipeDetail {
        val existing = getRecipeCached(id)
        val result =
            if (existing != null) {
                val updated =
                    existing
                        .copy(
                            name = recipe.name ?: existing.name,
                            totalServings = recipe.totalServings ?: existing.totalServings,
                            isFavorite = recipe.isFavorite ?: existing.isFavorite,
                            // Images never ride on a recipe body: `imageUrl` has a null
                            // default and the client omits defaults, so a removal sent
                            // this way would be dropped. [setImage] owns the field.
                            imageUrl = existing.imageUrl,
                            ingredients = recipe.ingredients?.toRecipeIngredients() ?: existing.ingredients,
                            cookedWeight =
                                cleared.pick(RecipeField.COOKED_WEIGHT, recipe.cookedWeight, existing.cookedWeight),
                        ).withRecomputedMacros()
                withContext(Dispatchers.IO) { cacheRecipe(updated) }
                updated
            } else {
                RecipeDetail(
                    id = id,
                    userId = "",
                    name = recipe.name ?: "",
                    totalServings = recipe.totalServings ?: 1.0,
                    isFavorite = recipe.isFavorite ?: false,
                    imageUrl = recipe.imageUrl,
                    cookedWeight = recipe.cookedWeight,
                    calories = 0.0,
                    protein = 0.0,
                    carbs = 0.0,
                    fat = 0.0,
                    fiber = 0.0,
                    ingredients = recipe.ingredients?.toRecipeIngredients() ?: emptyList(),
                ).withRecomputedMacros()
            }
        if (id.isTempId()) {
            coalesceQueuedCreate(id, recipe, cleared)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateRecipe(id, json.encodeToString(recipe), cleared.jsonKeys()))
        }
        return result
    }

    /** The cache-side counterpart of the explicit null a partial-update request carries. */
    private fun <T> Set<RecipeField>.pick(
        field: RecipeField,
        updated: T?,
        existing: T?,
    ): T? = if (field in this) null else updated ?: existing

    /**
     * Attaches or removes a recipe's image, as a partial PATCH — a full
     * [RecipeUpdate] body would rewrite the ingredients from whatever the cache
     * happens to hold, and its `imageUrl` default would swallow a removal. The
     * previous image is evicted from the device once it can no longer be referenced.
     */
    suspend fun setImage(
        id: String,
        imageUrl: String?,
    ): RecipeDetail? {
        val previous = getRecipeCached(id)
        val updated = previous?.copy(imageUrl = imageUrl)?.also { withContext(Dispatchers.IO) { cacheRecipe(it) } }
        if (id.isTempId()) {
            syncQueue.rewriteQueuedCreate("recipes", id) { op ->
                val create = op as? SyncOperation.CreateRecipe ?: return@rewriteQueuedCreate null
                val body = json.decodeOrNull<RecipeCreate>(create.body) ?: return@rewriteQueuedCreate null
                create.copy(body = json.encodeToString(body.copy(imageUrl = imageUrl)))
            }
        } else {
            syncQueue.enqueue(SyncOperation.SetRecipeImage(id, imageUrl))
        }
        previous?.imageUrl?.takeIf { it != imageUrl }?.let { onImageOrphaned?.invoke(it) }
        return updated
    }

    suspend fun deleteRecipe(id: String) {
        val imageUrl = getRecipeCached(id)?.imageUrl
        withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteRecipe(id) }
        if (id.isTempId()) {
            syncQueue.removeByAffected("recipes", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteRecipe(id))
        }
        imageUrl?.let { onImageOrphaned?.invoke(it) }
    }

    /**
     * Asks first instead of deleting-then-hoping: [deleteRecipe] always deletes locally and
     * queues the server delete, which — if the recipe still has diary entries — used to
     * dead-letter on the resulting 409 and reappear on the next refresh, with no indication
     * to the user why. In Local mode (or a not-yet-uploaded temp id) there is no server to
     * ask, so diary entries referencing it are counted locally instead.
     */
    suspend fun deleteRecipeChecked(id: String): DeleteOutcome {
        if (appModeManager.isLocal || id.isTempId()) {
            val entryCount =
                withContext(Dispatchers.IO) {
                    db.userDataDatabaseQueries
                        .selectEntriesByRecipeId(id)
                        .executeAsList()
                        .size
                }
            if (entryCount > 0) return DeleteOutcome.Blocked(entryCount)
            deleteRecipe(id)
            return DeleteOutcome.Deleted
        }
        return try {
            api.deleteRecipe(id)
            val imageUrl = getRecipeCached(id)?.imageUrl
            withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteRecipe(id) }
            syncQueue.removeByAffected("recipes", id)
            imageUrl?.let { onImageOrphaned?.invoke(it) }
            DeleteOutcome.Deleted
        } catch (e: ApiException) {
            if (e.statusCode == 409) {
                val conflict = e.responseBody?.let { json.decodeOrNull<DeleteConflictBody>(it) }
                DeleteOutcome.Blocked(conflict?.entryCount ?: 0, conflict?.ingredientCount, conflict?.recipeCount)
            } else {
                // Not a conflict — likely offline/network. Fall back to the optimistic
                // path so the delete isn't lost; it'll be resolved (and surfaced if it
                // still conflicts) when the sync queue drains.
                deleteRecipe(id)
                DeleteOutcome.Deleted
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            deleteRecipe(id)
            DeleteOutcome.Deleted
        }
    }

    /** Deletes a recipe the user already confirmed via a [DeleteOutcome.Blocked] prompt. */
    suspend fun forceDeleteRecipe(id: String) {
        if (appModeManager.isLocal || id.isTempId()) {
            deleteRecipe(id)
            return
        }
        val imageUrl = getRecipeCached(id)?.imageUrl
        withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteRecipe(id) }
        try {
            api.deleteRecipe(id, force = true)
            syncQueue.removeByAffected("recipes", id)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            // Offline or a transient failure — queue the forced delete so the user's
            // confirmed choice still lands once connectivity returns.
            syncQueue.enqueue(SyncOperation.DeleteRecipe(id, force = true))
        }
        imageUrl?.let { onImageOrphaned?.invoke(it) }
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id recipe so the eventual
     * upload carries the edited values. If the create has already been drained (no
     * queued op found), the update is skipped — the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: RecipeUpdate,
        cleared: Set<RecipeField> = emptySet(),
    ) {
        syncQueue.rewriteQueuedCreate("recipes", tempId) { op ->
            val create = op as? SyncOperation.CreateRecipe ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<RecipeCreate>(create.body) ?: return@rewriteQueuedCreate null
            // A create body needs no explicit nulls: an omitted field is already
            // "no value", so nulling the merged property is the whole clear.
            val merged =
                body.copy(
                    name = update.name ?: body.name,
                    totalServings = update.totalServings ?: body.totalServings,
                    ingredients = update.ingredients ?: body.ingredients,
                    isFavorite = update.isFavorite ?: body.isFavorite,
                    cookedWeight = cleared.pick(RecipeField.COOKED_WEIGHT, update.cookedWeight, body.cookedWeight),
                )
            create.copy(body = json.encodeToString(merged))
        }
    }

    private fun cacheRecipe(recipe: RecipeDetail) {
        db.userDataDatabaseQueries.insertRecipe(
            id = recipe.id,
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = if (recipe.isFavorite) 1L else 0L,
            calories = recipe.calories,
            protein = recipe.protein,
            carbs = recipe.carbs,
            fat = recipe.fat,
            fiber = recipe.fiber,
            jsonData = json.encodeToString(recipe),
        )
    }

    private fun recipeCreateToRecipe(recipe: RecipeCreate): RecipeDetail =
        RecipeDetail(
            id = newTempId(),
            userId = "",
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = recipe.isFavorite ?: false,
            imageUrl = recipe.imageUrl,
            cookedWeight = recipe.cookedWeight,
            calories = 0.0,
            protein = 0.0,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            ingredients = recipe.ingredients.toRecipeIngredients(),
        ).withRecomputedMacros()

    private fun List<RecipeIngredientInput>.toRecipeIngredients(): List<RecipeIngredient> =
        mapIndexed { index, input ->
            RecipeIngredient(
                foodId = input.foodId,
                quantity = input.quantity,
                servingUnit = RecipeIngredient.ServingUnit.valueOf(input.servingUnit.name),
                sortOrder = index,
            )
        }

    /**
     * Recomputes the per-serving macros from the locally cached ingredient foods,
     * matching the server's computation. When that is not possible (no ingredients, or
     * a referenced food is not cached locally — possible in Synced mode), the current
     * values are kept and the next server refresh corrects them.
     */
    private fun RecipeDetail.withRecomputedMacros(): RecipeDetail {
        val macros =
            computeRecipePerServingMacros(ingredients, totalServings) { foodId ->
                db.userDataDatabaseQueries
                    .selectFoodById(foodId)
                    .executeAsOneOrNull()
                    ?.let { json.decodeOrNull<Food>(it.jsonData) }
            } ?: return this
        return copy(
            calories = macros.calories,
            protein = macros.protein,
            carbs = macros.carbs,
            fat = macros.fat,
            fiber = macros.fiber,
        )
    }
}
