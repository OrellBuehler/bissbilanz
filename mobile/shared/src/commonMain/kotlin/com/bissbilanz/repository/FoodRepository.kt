package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class FoodRepository(
    private val api: BissbilanzApi,
    private val db: BissbilanzDatabase,
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
                _foods.value = cached.map { json.decodeFromString<Food>(it.json_) }
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
                _favorites.value = cached.map { json.decodeFromString<Food>(it.json_) }
            } else {
                throw e
            }
        }
    }

    suspend fun loadRecentFoods(limit: Int = 20) {
        _recentFoods.value = api.getRecentFoods(limit)
    }

    suspend fun getFood(id: String): Food = api.getFood(id)

    suspend fun createFood(food: FoodCreate): Food {
        val created = api.createFood(food)
        loadFoods()
        return created
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val updated = api.updateFood(id, food)
        loadFoods()
        return updated
    }

    suspend fun deleteFood(id: String) {
        api.deleteFood(id)
        db.bissbilanzDatabaseQueries.deleteFood(id)
        _foods.value = _foods.value.filter { it.id != id }
    }

    suspend fun searchFoods(query: String): List<Food> = api.searchFoods(query)

    suspend fun findByBarcode(barcode: String): Food? = api.getFoodByBarcode(barcode)

    private fun cacheFoods(foods: List<Food>) {
        db.bissbilanzDatabaseQueries.transaction {
            foods.forEach { food ->
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
                    json_ = json.encodeToString(food),
                )
            }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "foods",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
    }
}
