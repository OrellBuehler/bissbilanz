package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.model.Food
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.ServingUnit
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class FoodRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var repository: FoodRepository

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxed = true)
        db = mockk {
            every { bissbilanzDatabaseQueries } returns queries
        }
        repository = FoodRepository(api, db)
    }

    @Test
    fun loadFoodsUpdatesStateFlowOnSuccess() = runTest {
        val foods = listOf(testFood("1", "Apple"), testFood("2", "Banana"))
        coEvery { api.getFoods(100, 0) } returns foods

        repository.loadFoods()

        assertEquals(2, repository.foods.value.size)
        assertEquals("Apple", repository.foods.value[0].name)
    }

    @Test
    fun loadFavoritesUpdatesStateFlow() = runTest {
        val favorites = listOf(testFood("1", "Chicken", isFavorite = true))
        coEvery { api.getFavorites() } returns favorites

        repository.loadFavorites()

        assertEquals(1, repository.favorites.value.size)
        assertTrue(repository.favorites.value[0].isFavorite)
    }

    @Test
    fun searchFoodsReturnsResults() = runTest {
        val results = listOf(testFood("1", "Apple"), testFood("2", "Apple Pie"))
        coEvery { api.searchFoods("apple") } returns results

        val found = repository.searchFoods("apple")

        assertEquals(2, found.size)
    }

    @Test
    fun deleteFoodRemovesFromStateFlow() = runTest {
        val foods = listOf(testFood("1", "Apple"), testFood("2", "Banana"))
        coEvery { api.getFoods(100, 0) } returns foods
        coEvery { api.deleteFood("1") } returns Unit

        repository.loadFoods()
        repository.deleteFood("1")

        assertEquals(1, repository.foods.value.size)
        assertEquals("Banana", repository.foods.value[0].name)
        coVerify { queries.deleteFood("1") }
    }

    @Test
    fun findByBarcodeReturnsFood() = runTest {
        val food = testFood("1", "Milk")
        coEvery { api.getFoodByBarcode("123456") } returns food

        val result = repository.findByBarcode("123456")

        assertEquals("Milk", result?.name)
    }

    @Test
    fun findByBarcodeReturnsNullWhenNotFound() = runTest {
        coEvery { api.getFoodByBarcode("000000") } returns null

        val result = repository.findByBarcode("000000")

        assertNull(result)
    }

    @Test
    fun createFoodCallsApiAndReloads() = runTest {
        val create = FoodCreate(
            name = "Rice",
            servingSize = 100.0,
            servingUnit = ServingUnit.G,
            calories = 130.0,
            protein = 2.7,
            carbs = 28.0,
            fat = 0.3,
            fiber = 0.4,
        )
        val created = testFood("3", "Rice")
        coEvery { api.createFood(create) } returns created
        coEvery { api.getFoods(100, 0) } returns listOf(created)

        val result = repository.createFood(create)

        assertEquals("Rice", result.name)
        coVerify { api.createFood(create) }
    }

    @Test
    fun foodsStateFlowStartsEmpty() {
        assertTrue(repository.foods.value.isEmpty())
        assertTrue(repository.favorites.value.isEmpty())
        assertTrue(repository.recentFoods.value.isEmpty())
    }

    companion object {
        fun testFood(
            id: String,
            name: String,
            isFavorite: Boolean = false,
        ) = Food(
            id = id,
            userId = "user-1",
            name = name,
            servingSize = 100.0,
            servingUnit = ServingUnit.G,
            calories = 100.0,
            protein = 5.0,
            carbs = 15.0,
            fat = 3.0,
            fiber = 2.0,
            isFavorite = isFavorite,
        )
    }
}
