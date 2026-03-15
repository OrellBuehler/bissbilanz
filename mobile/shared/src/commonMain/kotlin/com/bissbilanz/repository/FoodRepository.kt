package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class FoodRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO,
) {
    private val _recentFoods = MutableStateFlow<List<Food>>(emptyList())
    val recentFoods: StateFlow<List<Food>> = _recentFoods.asStateFlow()

    fun allFoods(): Flow<List<Food>> =
        db.bissbilanzDatabaseQueries
            .selectAllFoods()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { json.decodeFromString<Food>(it.jsonData) } }

    fun favorites(): Flow<List<Food>> =
        db.bissbilanzDatabaseQueries
            .selectFavorites()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { json.decodeFromString<Food>(it.jsonData) } }

    suspend fun refreshFoods(
        limit: Int = 100,
        offset: Int = 0,
    ) {
        try {
            val foods = api.getFoods(limit, offset)
            cacheFoods(foods)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun refreshFavorites() {
        try {
            val favs = api.getFavorites()
            favs.forEach { cacheFood(it) }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun refreshRecentFoods(limit: Int = 20) {
        try {
            _recentFoods.value = api.getRecentFoods(limit)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }

    suspend fun getFood(id: String): Food =
        try {
            val food = api.getFood(id)
            cacheFood(food)
            food
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            val cached = db.bissbilanzDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
            if (cached != null) {
                json.decodeFromString<Food>(cached.jsonData)
            } else {
                throw e
            }
        }

    suspend fun createFood(food: FoodCreate): Food {
        val tempFood = foodCreateToFood(food)
        cacheFood(tempFood)
        syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(food)))
        return tempFood
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val tempFood = foodCreateToFood(food, id)
        cacheFood(tempFood)
        syncQueue.enqueue(SyncOperation.UpdateFood(id, json.encodeToString(food)))
        return tempFood
    }

    suspend fun deleteFood(id: String) {
        db.bissbilanzDatabaseQueries.deleteFood(id)
        syncQueue.enqueue(SyncOperation.DeleteFood(id))
    }

    suspend fun searchFoods(query: String): List<Food> =
        try {
            api.searchFoods(query)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            val pattern = "%$query%"
            db.bissbilanzDatabaseQueries
                .searchFoods(pattern, pattern, 50)
                .executeAsList()
                .map { json.decodeFromString<Food>(it.jsonData) }
        }

    suspend fun findByBarcode(barcode: String): Food? =
        coroutineScope {
            val apiResult =
                async {
                    try {
                        api.getFoodByBarcode(barcode)
                    } catch (e: Exception) {
                        if (e is kotlin.coroutines.cancellation.CancellationException) throw e
                        null
                    }
                }
            val cacheResult =
                async(ioDispatcher) {
                    db.bissbilanzDatabaseQueries
                        .selectFoodByBarcode(barcode)
                        .executeAsOneOrNull()
                        ?.let { json.decodeFromString<Food>(it.jsonData) }
                }

            val apiFood = apiResult.await()
            val cachedFood = cacheResult.await()

            if (apiFood != null) {
                cacheFood(apiFood)
                apiFood
            } else {
                cachedFood
            }
        }

    private fun cacheFood(food: Food) {
        db.bissbilanzDatabaseQueries.insertFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = if (food.isFavorite) 1L else 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )
    }

    private fun cacheFoods(foods: List<Food>) {
        db.bissbilanzDatabaseQueries.transaction {
            foods.forEach { food -> cacheFood(food) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "foods",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }

    private fun foodCreateToFood(
        food: FoodCreate,
        id: String = "temp_${Clock.System.now().toEpochMilliseconds()}",
    ): Food =
        Food(
            id = id,
            userId = "",
            name = food.name,
            brand = food.brand,
            servingSize = food.servingSize,
            servingUnit = food.servingUnit,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            barcode = food.barcode,
            isFavorite = food.isFavorite ?: false,
            imageUrl = food.imageUrl,
        )
}
