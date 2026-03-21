package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class RecipeRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
) {
    fun allRecipes(): Flow<List<RecipeDetail>> =
        db.bissbilanzDatabaseQueries
            .selectAllRecipes()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<RecipeDetail>(it.jsonData) } }

    suspend fun refresh() {
        val summaries = api.getRecipes()
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteAllRecipes()
            summaries.forEach { s ->
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
                db.bissbilanzDatabaseQueries.insertRecipe(
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
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "recipes",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    suspend fun getRecipe(id: String): RecipeDetail =
        try {
            val recipe = api.getRecipe(id)
            cacheRecipe(recipe)
            recipe
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.bissbilanzDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
            cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) } ?: throw e
        }

    suspend fun createRecipe(recipe: RecipeCreate): RecipeDetail {
        val temp = recipeCreateToRecipe(recipe)
        cacheRecipe(temp)
        syncQueue.enqueue(SyncOperation.CreateRecipe(json.encodeToString(recipe)))
        return temp
    }

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): RecipeDetail {
        val cached = db.bissbilanzDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
        val existing = cached?.let { json.decodeOrNull<RecipeDetail>(it.jsonData) }
        val result =
            if (existing != null) {
                val updated =
                    existing.copy(
                        name = recipe.name ?: existing.name,
                        totalServings = recipe.totalServings ?: existing.totalServings,
                        isFavorite = recipe.isFavorite ?: existing.isFavorite,
                        imageUrl = recipe.imageUrl ?: existing.imageUrl,
                    )
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
                    ingredients = emptyList(),
                )
            }
        syncQueue.enqueue(SyncOperation.UpdateRecipe(id, json.encodeToString(recipe)))
        return result
    }

    suspend fun deleteRecipe(id: String) {
        db.bissbilanzDatabaseQueries.deleteRecipe(id)
        syncQueue.enqueue(SyncOperation.DeleteRecipe(id))
    }

    private fun cacheRecipe(recipe: RecipeDetail) {
        db.bissbilanzDatabaseQueries.insertRecipe(
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

    @OptIn(ExperimentalUuidApi::class)
    private fun recipeCreateToRecipe(recipe: RecipeCreate): RecipeDetail =
        RecipeDetail(
            id = "temp_${Uuid.random()}",
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
            ingredients = emptyList(),
        )
}
