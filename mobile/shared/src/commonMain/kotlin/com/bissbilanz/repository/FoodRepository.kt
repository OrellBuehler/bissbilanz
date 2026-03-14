package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.urlToMeta
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class FoodRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
    private val connectivity: ConnectivityProvider,
    private val syncQueue: SyncQueue,
) {
    private val _foods = MutableStateFlow<List<Food>>(emptyList())
    val foods: StateFlow<List<Food>> = _foods.asStateFlow()

    private val _favorites = MutableStateFlow<List<Food>>(emptyList())
    val favorites: StateFlow<List<Food>> = _favorites.asStateFlow()

    private val _recentFoods = MutableStateFlow<List<Food>>(emptyList())
    val recentFoods: StateFlow<List<Food>> = _recentFoods.asStateFlow()

    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
        }

    suspend fun loadFoods(
        limit: Int = 100,
        offset: Int = 0,
    ) {
        try {
            val foods = api.getFoods(limit, offset)
            cacheFoods(foods)
            _foods.value = foods
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectAllFoods().executeAsList()
            if (cached.isNotEmpty()) {
                _foods.value = cached.map { json.decodeFromString<Food>(it.jsonData) }
            } else {
                throw e
            }
        }
    }

    suspend fun loadFavorites() {
        try {
            val favs = api.getFavorites()
            _favorites.value = favs
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectFavorites().executeAsList()
            if (cached.isNotEmpty()) {
                _favorites.value = cached.map { json.decodeFromString<Food>(it.jsonData) }
            } else {
                throw e
            }
        }
    }

    suspend fun loadRecentFoods(limit: Int = 20) {
        try {
            _recentFoods.value = api.getRecentFoods(limit)
        } catch (_: Exception) {
            // No offline equivalent for recent foods
        }
    }

    suspend fun getFood(id: String): Food =
        try {
            api.getFood(id)
        } catch (e: Exception) {
            val cached = db.bissbilanzDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
            if (cached != null) {
                json.decodeFromString<Food>(cached.jsonData)
            } else {
                throw e
            }
        }

    suspend fun createFood(food: FoodCreate): Food {
        if (!connectivity.isOnline.value) {
            val url = "/api/foods"
            val body = json.encodeToString(food)
            val meta = urlToMeta(url)
            syncQueue.enqueue("POST", url, body, meta.affectedTable, meta.affectedId)
            // Return a placeholder food with a temp ID for optimistic UI
            val tempFood = foodCreateToFood(food)
            cacheFood(tempFood)
            _foods.value = _foods.value + tempFood
            return tempFood
        }
        val created = api.createFood(food)
        cacheFood(created)
        _foods.value = _foods.value + created
        return created
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        if (!connectivity.isOnline.value) {
            val url = "/api/foods/$id"
            val body = json.encodeToString(food)
            val meta = urlToMeta(url)
            syncQueue.enqueue("PUT", url, body, meta.affectedTable, meta.affectedId)
            val tempFood = foodCreateToFood(food, id)
            cacheFood(tempFood)
            _foods.value = _foods.value.map { if (it.id == id) tempFood else it }
            return tempFood
        }
        val updated = api.updateFood(id, food)
        cacheFood(updated)
        _foods.value = _foods.value.map { if (it.id == updated.id) updated else it }
        return updated
    }

    suspend fun deleteFood(id: String) {
        if (!connectivity.isOnline.value) {
            val url = "/api/foods/$id"
            val meta = urlToMeta(url)
            syncQueue.enqueue("DELETE", url, "", meta.affectedTable, meta.affectedId)
        } else {
            api.deleteFood(id)
        }
        db.bissbilanzDatabaseQueries.deleteFood(id)
        _foods.value = _foods.value.filter { it.id != id }
    }

    suspend fun searchFoods(query: String): List<Food> =
        try {
            api.searchFoods(query)
        } catch (_: Exception) {
            val pattern = "%$query%"
            db.bissbilanzDatabaseQueries
                .searchFoods(pattern, pattern, 50)
                .executeAsList()
                .map { json.decodeFromString<Food>(it.jsonData) }
        }

    suspend fun findByBarcode(barcode: String): Food? =
        try {
            api.getFoodByBarcode(barcode)
        } catch (_: Exception) {
            db.bissbilanzDatabaseQueries
                .selectFoodByBarcode(barcode)
                .executeAsOneOrNull()
                ?.let { json.decodeFromString<Food>(it.jsonData) }
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
