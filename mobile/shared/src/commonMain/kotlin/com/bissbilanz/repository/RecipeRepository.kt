package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.computeRecipePerServingMacros
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class RecipeRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
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
                    )
                queries.insertRecipe(
                    id = recipe.id,
                    name = recipe.name,
                    totalServings = recipe.totalServings,
                    isFavorite = if (recipe.isFavorite) 1L else 0L,
                    calories = s.calories,
                    protein = s.protein,
                    carbs = s.carbs,
                    fat = s.fat,
                    fiber = s.fiber,
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

    /** Recipe ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingRecipeIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "recipes" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    suspend fun getRecipe(id: String): RecipeDetail {
        if (appModeManager.isLocal) {
            val cached = db.userDataDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
            return cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }
                ?: throw IllegalStateException("Recipe $id not found in local database")
        }
        return try {
            val recipe = api.getRecipe(id)
            cacheRecipe(recipe)
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
        cacheRecipe(temp)
        syncQueue.enqueue(SyncOperation.CreateRecipe(json.encodeToString(recipe), localId = temp.id))
        return temp
    }

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): RecipeDetail {
        val cached = db.userDataDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
        val existing = cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }
        val result =
            if (existing != null) {
                val updated =
                    existing
                        .copy(
                            name = recipe.name ?: existing.name,
                            totalServings = recipe.totalServings ?: existing.totalServings,
                            isFavorite = recipe.isFavorite ?: existing.isFavorite,
                            imageUrl = recipe.imageUrl ?: existing.imageUrl,
                            ingredients = recipe.ingredients?.toRecipeIngredients() ?: existing.ingredients,
                        ).withRecomputedMacros()
                cacheRecipe(updated)
                updated
            } else {
                RecipeDetail(
                    id = id,
                    userId = "",
                    name = recipe.name ?: "",
                    totalServings = recipe.totalServings ?: 1.0,
                    isFavorite = recipe.isFavorite ?: false,
                    imageUrl = recipe.imageUrl,
                    calories = 0.0,
                    protein = 0.0,
                    carbs = 0.0,
                    fat = 0.0,
                    fiber = 0.0,
                    ingredients = recipe.ingredients?.toRecipeIngredients() ?: emptyList(),
                ).withRecomputedMacros()
            }
        if (id.isTempId()) {
            coalesceQueuedCreate(id, recipe)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateRecipe(id, json.encodeToString(recipe)))
        }
        return result
    }

    suspend fun deleteRecipe(id: String) {
        db.userDataDatabaseQueries.deleteRecipe(id)
        if (id.isTempId()) {
            syncQueue.removeByAffected("recipes", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteRecipe(id))
        }
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id recipe so the eventual
     * upload carries the edited values. If the create has already been drained (no
     * queued op found), the update is skipped — the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: RecipeUpdate,
    ) {
        syncQueue.rewriteQueuedCreate("recipes", tempId) { op ->
            val create = op as? SyncOperation.CreateRecipe ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<RecipeCreate>(create.body) ?: return@rewriteQueuedCreate null
            val merged =
                body.copy(
                    name = update.name ?: body.name,
                    totalServings = update.totalServings ?: body.totalServings,
                    ingredients = update.ingredients ?: body.ingredients,
                    isFavorite = update.isFavorite ?: body.isFavorite,
                    imageUrl = update.imageUrl ?: body.imageUrl,
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
