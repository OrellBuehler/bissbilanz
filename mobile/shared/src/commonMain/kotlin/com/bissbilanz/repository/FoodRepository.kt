package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FoodRepository(
    private val api: BissbilanzApi,
) {
    private val _foods = MutableStateFlow<List<Food>>(emptyList())
    val foods: StateFlow<List<Food>> = _foods.asStateFlow()

    private val _favorites = MutableStateFlow<List<Food>>(emptyList())
    val favorites: StateFlow<List<Food>> = _favorites.asStateFlow()

    private val _recentFoods = MutableStateFlow<List<Food>>(emptyList())
    val recentFoods: StateFlow<List<Food>> = _recentFoods.asStateFlow()

    suspend fun loadFoods(
        limit: Int = 100,
        offset: Int = 0,
    ) {
        _foods.value = api.getFoods(limit, offset)
    }

    suspend fun loadFavorites() {
        _favorites.value = api.getFavorites()
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
        _foods.value = _foods.value.filter { it.id != id }
    }

    suspend fun searchFoods(query: String): List<Food> = api.searchFoods(query)

    suspend fun findByBarcode(barcode: String): Food? = api.getFoodByBarcode(barcode)
}
