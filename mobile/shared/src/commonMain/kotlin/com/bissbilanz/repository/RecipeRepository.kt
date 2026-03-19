package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.model.Recipe
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class RecipeRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
) {
    fun allRecipes(): Flow<List<Recipe>> =
        db.bissbilanzDatabaseQueries
            .selectAllRecipes()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { json.decodeFromString<Recipe>(it.jsonData) } }

    suspend fun refresh() {
        val recipes = api.getRecipes()
        cacheRecipes(recipes)
    }

    suspend fun getRecipe(id: String): Recipe =
        try {
            val recipe = api.getRecipe(id)
            cacheRecipe(recipe)
            recipe
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.bissbilanzDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
            if (cached != null) {
                json.decodeFromString<Recipe>(cached.jsonData)
            } else {
                throw e
            }
        }

    suspend fun createRecipe(recipe: RecipeCreate): Recipe {
        val temp = recipeCreateToRecipe(recipe)
        cacheRecipe(temp)
        syncQueue.enqueue(SyncOperation.CreateRecipe(json.encodeToString(recipe)))
        return temp
    }

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): Recipe {
        val cached = db.bissbilanzDatabaseQueries.selectRecipeById(id).executeAsOneOrNull()
        val existing = cached?.let { json.decodeFromString<Recipe>(it.jsonData) }
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
                Recipe(
                    id = id,
                    userId = "",
                    name = recipe.name ?: "",
                    totalServings = recipe.totalServings ?: 1.0,
                )
            }
        syncQueue.enqueue(SyncOperation.UpdateRecipe(id, json.encodeToString(recipe)))
        return result
    }

    suspend fun deleteRecipe(id: String) {
        db.bissbilanzDatabaseQueries.deleteRecipe(id)
        syncQueue.enqueue(SyncOperation.DeleteRecipe(id))
    }

    private fun cacheRecipe(recipe: Recipe) {
        var calories = 0.0
        var protein = 0.0
        var carbs = 0.0
        var fat = 0.0
        var fiber = 0.0
        recipe.ingredients?.forEach { ing ->
            val food = ing.food ?: return@forEach
            val q = ing.quantity
            calories += food.calories * q
            protein += food.protein * q
            carbs += food.carbs * q
            fat += food.fat * q
            fiber += food.fiber * q
        }
        db.bissbilanzDatabaseQueries.insertRecipe(
            id = recipe.id,
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = if (recipe.isFavorite) 1L else 0L,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            jsonData = json.encodeToString(recipe),
        )
    }

    private fun cacheRecipes(recipes: List<Recipe>) {
        db.bissbilanzDatabaseQueries.transaction {
            db.bissbilanzDatabaseQueries.deleteAllRecipes()
            recipes.forEach { recipe -> cacheRecipe(recipe) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "recipes",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    private fun recipeCreateToRecipe(recipe: RecipeCreate): Recipe =
        Recipe(
            id = "temp_${Clock.System.now().toEpochMilliseconds()}",
            userId = "",
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = recipe.isFavorite ?: false,
            imageUrl = recipe.imageUrl,
        )
}
